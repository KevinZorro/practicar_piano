import {
  NoteDetector,
  type DetectionEvent,
  type DetectorOptions,
  type DetectorTuning,
  type SpectrumFrame,
} from './noteDetector';

/** What the C4 calibration learned about this keyboard, room and microphone. */
export interface Calibration {
  /** Keyboard tuning against A=440, in cents. */
  readonly tuningCents: number;
  /** Seconds between pressing a key and the detector first seeing it (median of the beats). */
  readonly latencyS: number;
  /** Median absolute deviation of the beats: how steady the timing was. */
  readonly latencySpreadS: number;
  /** Background level, in dB per bin, measured before the first beat. */
  readonly noiseDb: number;
  /** Typical level of the C4 peaks over the background, in dB. */
  readonly signalOverNoiseDb: number;
  /** Rise over the background of each partial of C4, in dB. */
  readonly partialRiseDb: readonly number[];
  readonly beatsHeard: number;
}

export const DEFAULT_LATENCY_S = 0.1;

export type CalibrationWarning = 'noisy-room' | 'quiet-signal' | 'uneven-timing';

export interface CalibrationResult {
  /** Null when too few beats were heard to learn anything. */
  readonly calibration: Calibration | null;
  readonly warnings: readonly CalibrationWarning[];
}

export function tuningOf(c: Calibration | null): DetectorTuning {
  if (!c) return { cents: 0, partialRiseDb: [] };
  return { cents: c.tuningCents, partialRiseDb: c.partialRiseDb.map((r) => r * 0.5) };
}

/** Where a calibration run is, for the screen. */
export type CalibrationPhase =
  | { readonly kind: 'quiet'; readonly remainingS: number }
  | {
      readonly kind: 'beat';
      readonly index: number;
      readonly total: number;
      readonly heard: number;
    }
  | { readonly kind: 'done'; readonly result: CalibrationResult };

export const C4 = 60;
const LISTEN_AFTER_S = 1.0;
const MAX_NOISE_DB = -82;
const MIN_SNR_DB = 25;
const MAX_SPREAD_S = 0.12;
const MIN_BEATS = 3;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

interface Beat {
  onsetS: number;
  emittedS: number;
  offsets: number[];
  rises: number[][];
  peakDb: number[];
}

/**
 * Runs the "play C4 five times" calibration over the same spectrum frames the detector
 * sees. The screen plays a click at each `cueTimes` entry and the player strikes C4 with
 * it; everything else is measured here, with no browser in the way (so it is testable).
 */
export class Calibrator {
  private readonly detector: NoteDetector;
  private startS: number | null = null;
  private noiseDb = -120;
  private noiseFrozen = false;
  private beats: Beat[] = [];
  private result: CalibrationResult | null = null;

  constructor(
    private readonly options: {
      beats?: number;
      quietS?: number;
      beatEveryS?: number;
      detector?: Partial<DetectorOptions>;
    } = {},
  ) {
    this.detector = new NoteDetector(options.detector);
    this.detector.setExpected([C4]);
    const total = options.beats ?? 5;
    this.beatsTotal = total;
    this.quietS = options.quietS ?? 1.2;
    this.beatEveryS = options.beatEveryS ?? 1.5;
  }

  private readonly beatsTotal: number;
  private readonly quietS: number;
  private readonly beatEveryS: number;

  /** Absolute time of cue `i` (after the first frame defined the start); null before. */
  cueAt(i: number): number | null {
    return this.startS === null ? null : this.startS + this.quietS + i * this.beatEveryS;
  }

  get finished(): boolean {
    return this.result !== null;
  }

  phase(timeS: number): CalibrationPhase {
    if (this.result) return { kind: 'done', result: this.result };
    const start = this.startS ?? timeS;
    if (timeS < start + this.quietS - 0.05) {
      return { kind: 'quiet', remainingS: Math.max(0, start + this.quietS - timeS) };
    }
    const index = Math.min(
      this.beatsTotal - 1,
      Math.max(0, Math.floor((timeS - start - this.quietS + 0.3) / this.beatEveryS)),
    );
    return { kind: 'beat', index, total: this.beatsTotal, heard: this.beats.length };
  }

  process(frame: SpectrumFrame): CalibrationPhase {
    if (this.result) return { kind: 'done', result: this.result };
    this.startS ??= frame.timeS;
    const events = this.detector.process(frame);
    if (!this.noiseFrozen) {
      if (frame.timeS < this.startS + this.quietS - 0.1) {
        this.noiseDb = this.detector.backgroundDb(frame.sampleRate);
      } else {
        this.noiseFrozen = true;
      }
    }
    const hit = events.find((e) => e.kind === 'hit' && e.pitch === C4);
    if (hit) this.openBeat(hit);
    this.sampleOpenBeat(frame);
    const end = this.cueAt(this.beatsTotal - 1);
    if (end !== null && frame.timeS > end + LISTEN_AFTER_S) this.result = this.finish();
    return this.phase(frame.timeS);
  }

  private open: Beat | null = null;

  private openBeat(hit: DetectionEvent): void {
    // Only the hit nearest a cue counts, once per cue.
    const near = this.nearestCue(hit.onsetS);
    if (near === null || Math.abs(hit.onsetS - near.cue) > 1) return;
    if (this.beats.some((b) => this.nearestCue(b.onsetS)?.index === near.index)) return;
    this.open = { onsetS: hit.onsetS, emittedS: hit.timeS, offsets: [], rises: [], peakDb: [] };
    this.beats.push(this.open);
  }

  private sampleOpenBeat(frame: SpectrumFrame): void {
    const beat = this.open;
    if (!beat) return;
    if (frame.timeS - beat.emittedS > 0.25) {
      this.open = null;
      return;
    }
    const reading = this.detector.reading(C4);
    if (!reading?.present) return;
    beat.offsets.push(reading.meanOffsetCents);
    beat.rises.push(reading.partials.map((p) => p.riseDb));
    beat.peakDb.push(Math.max(...reading.partials.map((p) => p.riseDb)));
  }

  private nearestCue(timeS: number): { cue: number; index: number } | null {
    let best: { cue: number; index: number } | null = null;
    for (let i = 0; i < this.beatsTotal; i++) {
      const cue = this.cueAt(i);
      if (cue === null) return null;
      if (!best || Math.abs(timeS - cue) < Math.abs(timeS - best.cue)) best = { cue, index: i };
    }
    return best;
  }

  private finish(): CalibrationResult {
    const usable = this.beats.filter((b) => b.offsets.length > 0);
    const warnings: CalibrationWarning[] = [];
    if (this.noiseDb > MAX_NOISE_DB) warnings.push('noisy-room');
    if (usable.length < MIN_BEATS) return { calibration: null, warnings };
    const deltas = usable.map((b) => b.onsetS - (this.nearestCue(b.onsetS)?.cue ?? b.onsetS));
    const latency = median(deltas);
    const spread = median(deltas.map((d) => Math.abs(d - latency)));
    const partials = Math.max(...usable.map((b) => b.rises[0]?.length ?? 0));
    const partialRiseDb = Array.from({ length: partials }, (_, h) =>
      median(usable.map((b) => median(b.rises.map((r) => r[h] ?? 0)))),
    );
    const snr = median(usable.map((b) => median(b.peakDb)));
    if (snr < MIN_SNR_DB) warnings.push('quiet-signal');
    if (spread > MAX_SPREAD_S) warnings.push('uneven-timing');
    const calibration: Calibration = {
      tuningCents: median(usable.map((b) => median(b.offsets))),
      // Late or uneven beats say more about the player than about the microphone.
      latencyS: spread > MAX_SPREAD_S ? DEFAULT_LATENCY_S : Math.min(0.4, Math.max(0, latency)),
      latencySpreadS: spread,
      noiseDb: this.noiseDb,
      signalOverNoiseDb: snr,
      partialRiseDb,
      beatsHeard: usable.length,
    };
    return { calibration, warnings };
  }
}
