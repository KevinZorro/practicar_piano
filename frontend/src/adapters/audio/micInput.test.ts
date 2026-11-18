import { WebMicInput, localCalibrationStore, type MicStream } from './micInput';
import type { NoteMessage } from '../../core/input/noteInput';
import type { Calibration } from '../../core/audio/calibration';
import { analyserFrames, renderRoom } from '../../core/audio/testing/simulate';

/** A microphone that replays a simulated recording, one spectrum per poll. */
function fakeStream(signal: Float32Array): MicStream & { clicks: number[]; closed: boolean } {
  const frames = [...analyserFrames(signal, 8192, 0.02)];
  let i = 0;
  const state = { clicks: [] as number[], closed: false };
  return {
    sampleRate: 48000,
    readSpectrum: () => frames[Math.min(i, frames.length - 1)]?.db ?? new Float32Array(4096),
    nowS: () => frames[Math.min(i++, frames.length - 1)]?.timeS ?? 0,
    click: (at) => state.clicks.push(at),
    close: () => {
      state.closed = true;
    },
    get clicks() {
      return state.clicks;
    },
    get closed() {
      return state.closed;
    },
  };
}

describe('WebMicInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is unsupported without getUserMedia', async () => {
    expect(await new WebMicInput(undefined).start()).toBe('unsupported');
  });

  it('maps a refused permission to denied and a missing device to no-device', async () => {
    const denied = new WebMicInput(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    expect(await denied.start()).toBe('denied');
    const none = new WebMicInput(() => Promise.reject(new DOMException('none', 'NotFoundError')));
    expect(await none.start()).toBe('no-device');
  });

  it('turns confirmed notes into note-on messages that say how long ago the key went down', async () => {
    const signal = renderRoom(
      3,
      [{ pitch: 60, startS: 1.2, amplitude: 0.15 }],
      { noiseRms: 0.001 },
      1,
    );
    const stream = fakeStream(signal);
    const input = new WebMicInput(() => Promise.resolve(stream));
    input.setExpected([60]);
    const heard: NoteMessage[] = [];
    input.onNote((m) => heard.push(m));
    expect(await input.start()).toBe('ready');
    await vi.advanceTimersByTimeAsync(3000);
    expect(heard.map((m) => [m.type, m.pitch])).toEqual([['noteOn', 60]]);
    // Waited a few dozen ms to be sure; the default 100 ms latency is added on top.
    expect(heard[0]?.ageS).toBeGreaterThan(0.1);
    expect(heard[0]?.ageS).toBeLessThan(0.3);
    input.stop();
    expect(stream.closed).toBe(true);
    expect(input.status).toBe('idle');
  });

  it('reports a wrong key as a note-on of a pitch the song did not expect', async () => {
    const signal = renderRoom(
      3,
      [{ pitch: 67, startS: 1.2, amplitude: 0.15 }],
      { noiseRms: 0.001 },
      2,
    );
    const input = new WebMicInput(() => Promise.resolve(fakeStream(signal)));
    input.setExpected([60]);
    const heard: number[] = [];
    input.onNote((m) => heard.push(m.pitch));
    await input.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(heard).toEqual([67]);
    input.stop();
  });

  it('keeps a calibration in the store and loads it next time', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
    } as unknown as Storage;
    const store = localCalibrationStore(storage);
    const calibration: Calibration = {
      tuningCents: 4,
      latencyS: 0.12,
      latencySpreadS: 0.02,
      noiseDb: -98,
      signalOverNoiseDb: 40,
      partialRiseDb: [30],
      beatsHeard: 5,
    };
    new WebMicInput(undefined, store).setCalibration(calibration);
    expect(new WebMicInput(undefined, store).calibration).toEqual(calibration);
  });

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const store = localCalibrationStore(broken);
    expect(store.load()).toBeNull();
    expect(() => {
      store.save({
        tuningCents: 0,
        latencyS: 0.1,
        latencySpreadS: 0,
        noiseDb: -90,
        signalOverNoiseDb: 30,
        partialRiseDb: [],
        beatsHeard: 3,
      });
    }).not.toThrow();
  });
});
