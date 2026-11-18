import {
  Calibrator,
  tuningOf,
  type Calibration,
  type CalibrationPhase,
} from '../../core/audio/calibration';
import {
  NoteDetector,
  type DetectionEvent,
  type SpectrumFrame,
} from '../../core/audio/noteDetector';
import type { InputStatus, NoteInput, NoteMessage } from '../../core/input/noteInput';

/** What the browser gives us: a running microphone that can be asked for spectra. */
export interface MicStream {
  readonly sampleRate: number;
  /** Fills and returns the latest spectrum in dB (reused between calls). */
  readSpectrum(): Float32Array;
  /** Seconds on the audio clock. */
  nowS(): number;
  /** Plays a short click at audio-clock time `atS` (for the calibration beats). */
  click(atS: number): void;
  close(): void;
}

export type OpenMic = () => Promise<MicStream>;

export interface MicInput extends NoteInput {
  /** The notes the song expects right now; the detector only confirms these as hits. */
  setExpected(pitches: Iterable<number>): void;
  readonly calibration: Calibration | null;
  setCalibration(calibration: Calibration | null): void;
  /** Runs the "play C4 five times" calibration; resolves with its outcome. */
  calibrate(
    onPhase: (phase: CalibrationPhase) => void,
  ): Promise<CalibrationPhase & { kind: 'done' }>;
}

const POLL_MS = 20;
const VELOCITY = 96;

export interface CalibrationStore {
  load(): Calibration | null;
  save(calibration: Calibration): void;
}

export class WebMicInput implements MicInput {
  status: InputStatus = 'idle';
  calibration: Calibration | null;
  private stream: MicStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private detector = new NoteDetector();
  private calibrator: Calibrator | null = null;
  private calibrationDone: ((p: CalibrationPhase & { kind: 'done' }) => void) | null = null;
  private onPhase: ((p: CalibrationPhase) => void) | null = null;
  private clicksScheduled = 0;
  private readonly noteListeners = new Set<(m: NoteMessage) => void>();
  private readonly statusListeners = new Set<(s: InputStatus) => void>();

  constructor(
    private readonly open: OpenMic | undefined,
    private readonly store: CalibrationStore | null = null,
    private readonly pollMs = POLL_MS,
  ) {
    this.calibration = store?.load() ?? null;
    this.detector.setTuning(tuningOf(this.calibration));
  }

  async start(): Promise<InputStatus> {
    if (!this.open) return this.setStatus('unsupported');
    try {
      this.stream = await this.open();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      return this.setStatus(name === 'NotFoundError' ? 'no-device' : 'denied');
    }
    this.detector.reset();
    this.timer = setInterval(() => {
      this.poll();
    }, this.pollMs);
    return this.setStatus('ready');
  }

  setExpected(pitches: Iterable<number>): void {
    this.detector.setExpected(pitches);
  }

  setCalibration(calibration: Calibration | null): void {
    this.calibration = calibration;
    this.detector.setTuning(tuningOf(calibration));
    if (calibration) this.store?.save(calibration);
  }

  calibrate(onPhase: (phase: CalibrationPhase) => void) {
    return new Promise<CalibrationPhase & { kind: 'done' }>((resolve) => {
      this.calibrator = new Calibrator();
      this.clicksScheduled = 0;
      this.onPhase = onPhase;
      this.calibrationDone = resolve;
    });
  }

  onNote(listener: (message: NoteMessage) => void): () => void {
    this.noteListeners.add(listener);
    return () => this.noteListeners.delete(listener);
  }

  onStatusChange(listener: (status: InputStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.close();
    this.stream = null;
    this.calibrator = null;
    this.setStatus('idle');
  }

  private poll(): void {
    const stream = this.stream;
    if (!stream) return;
    const frame: SpectrumFrame = {
      db: stream.readSpectrum(),
      sampleRate: stream.sampleRate,
      timeS: stream.nowS(),
    };
    if (this.calibrator) {
      this.stepCalibration(stream, frame);
      return;
    }
    for (const event of this.detector.process(frame)) this.emit(event, frame.timeS);
  }

  private stepCalibration(stream: MicStream, frame: SpectrumFrame): void {
    const calibrator = this.calibrator;
    if (!calibrator) return;
    const phase = calibrator.process(frame);
    // Clicks are scheduled one by one on the audio clock as the run learns its start.
    for (;;) {
      const at = calibrator.cueAt(this.clicksScheduled);
      if (at === null || this.clicksScheduled >= 5) break;
      stream.click(at);
      this.clicksScheduled++;
    }
    this.onPhase?.(phase);
    if (phase.kind === 'done') {
      if (phase.result.calibration) this.setCalibration(phase.result.calibration);
      this.calibrator = null;
      this.detector.reset();
      this.calibrationDone?.(phase);
    }
  }

  private emit(event: DetectionEvent, nowS: number): void {
    const latency = this.calibration?.latencyS ?? 0.1;
    // The key went down when the detector first saw it, minus the learned delay.
    const ageS = Math.max(0, nowS - event.onsetS + latency);
    const message: NoteMessage = { type: 'noteOn', pitch: event.pitch, velocity: VELOCITY, ageS };
    for (const listener of this.noteListeners) listener(message);
  }

  private setStatus(status: InputStatus): InputStatus {
    if (status !== this.status) {
      this.status = status;
      for (const listener of this.statusListeners) listener(status);
    }
    return status;
  }
}

// --- The real browser -------------------------------------------------------------------

interface AudioContextLike {
  readonly sampleRate: number;
  readonly currentTime: number;
  readonly destination: unknown;
  createMediaStreamSource(stream: MediaStream): { connect(node: unknown): void };
  createAnalyser(): {
    fftSize: number;
    smoothingTimeConstant: number;
    minDecibels: number;
    maxDecibels: number;
    frequencyBinCount: number;
    getFloatFrequencyData(array: Float32Array<ArrayBuffer>): void;
  };
  createOscillator(): {
    frequency: { value: number };
    connect(node: unknown): void;
    start(t: number): void;
    stop(t: number): void;
  };
  createGain(): { gain: { value: number }; connect(node: unknown): void };
  resume(): Promise<void>;
  close(): Promise<void>;
}

export const FFT_SIZE = 8192;

/** Opens the microphone with every "improvement" off: they would mangle piano notes. */
export function openBrowserMic(
  nav: Navigator = navigator,
  makeContext: () => AudioContextLike = () => new AudioContext(),
): OpenMic | undefined {
  if (!('mediaDevices' in nav) || !('getUserMedia' in nav.mediaDevices)) return undefined;
  return async () => {
    const media = await nav.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    const ctx = makeContext();
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    analyser.minDecibels = -120;
    analyser.maxDecibels = 0;
    ctx.createMediaStreamSource(media).connect(analyser);
    const buffer = new Float32Array(analyser.frequencyBinCount);
    return {
      sampleRate: ctx.sampleRate,
      readSpectrum: () => {
        analyser.getFloatFrequencyData(buffer);
        return buffer;
      },
      nowS: () => ctx.currentTime,
      click: (atS) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 2400; // outside the partials a C4 shows, so it never reads as a note
        gain.gain.value = 0.2;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(atS);
        osc.stop(atS + 0.03);
      },
      close: () => {
        for (const track of media.getTracks()) track.stop();
        void ctx.close();
      },
    };
  };
}

const CALIBRATION_ITEM = 'notacaida.mic.calibration.v1';

/** Calibration in localStorage: tiny, per browser; every access may throw (private mode). */
export function localCalibrationStore(
  storage: Storage | undefined = safeLocalStorage(),
): CalibrationStore {
  return {
    load() {
      try {
        const raw = storage?.getItem(CALIBRATION_ITEM);
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<Calibration>;
        return typeof value.tuningCents === 'number' && typeof value.latencyS === 'number'
          ? (value as Calibration)
          : null;
      } catch {
        return null;
      }
    },
    save(calibration) {
      try {
        storage?.setItem(CALIBRATION_ITEM, JSON.stringify(calibration));
      } catch {
        // Not saving only means calibrating again next time.
      }
    },
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function createWebMicInput(): WebMicInput {
  return new WebMicInput(openBrowserMic(), localCalibrationStore());
}
