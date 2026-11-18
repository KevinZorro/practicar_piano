import { Calibrator, tuningOf } from './calibration';
import { analyserFrames, renderRoom, type RoomOptions } from './testing/simulate';

/** Plays C4 on each cue of the calibrator, `lateS` after the click. */
function run(room: RoomOptions, amplitude: number, beatsPlayed: number, lateS = 0) {
  const calibrator = new Calibrator();
  const startS = 0.17; // first frame time of the simulation (one window of samples)
  const strikes = Array.from({ length: beatsPlayed }, (_, i) => ({
    pitch: 60,
    startS: startS + 1.2 + i * 1.5 + lateS,
    amplitude,
    durationS: 1.2,
  }));
  const signal = renderRoom(10.5, strikes, room, 11);
  let last = calibrator.phase(0);
  for (const frame of analyserFrames(signal, 8192, 0.02)) {
    last = calibrator.process(frame);
    if (last.kind === 'done') break;
  }
  return last;
}

describe('Calibrator', () => {
  it('learns tuning, timing and noise from five C4 beats', () => {
    const done = run({ noiseRms: 0.001, detuneCents: 25 }, 0.15, 5);
    expect(done.kind).toBe('done');
    if (done.kind !== 'done') return;
    const c = done.result.calibration;
    expect(c).not.toBeNull();
    expect(c?.beatsHeard).toBe(5);
    expect(c?.tuningCents).toBeGreaterThan(18);
    expect(c?.tuningCents).toBeLessThan(32);
    // The detector sees a strike after ~70-110 ms: that is what the latency has to capture.
    expect(c?.latencyS).toBeGreaterThan(0.04);
    expect(c?.latencyS).toBeLessThan(0.16);
    expect(c?.noiseDb).toBeLessThan(-95);
    expect(done.result.warnings).toEqual([]);
  });

  it("adds the player's own lateness to the latency", () => {
    const base = run({ noiseRms: 0.001 }, 0.15, 5);
    const late = run({ noiseRms: 0.001 }, 0.15, 5, 0.08);
    const a = base.kind === 'done' ? base.result.calibration?.latencyS : undefined;
    const b = late.kind === 'done' ? late.result.calibration?.latencyS : undefined;
    expect((b ?? 0) - (a ?? 0)).toBeGreaterThan(0.05);
  });

  it('gives up without a calibration when fewer than three beats are heard', () => {
    const done = run({ noiseRms: 0.001 }, 0.15, 2);
    expect(done.kind === 'done' && done.result.calibration).toBeNull();
  });

  it('warns about a noisy room', () => {
    const done = run({ noiseRms: 0.02 }, 0.4, 5);
    expect(done.kind === 'done' && done.result.warnings).toContain('noisy-room');
  });

  it('turns a calibration into detector tuning, and none into neutral tuning', () => {
    expect(tuningOf(null)).toEqual({ cents: 0, partialRiseDb: [] });
    const t = tuningOf({
      tuningCents: 12,
      latencyS: 0.1,
      latencySpreadS: 0.01,
      noiseDb: -100,
      signalOverNoiseDb: 40,
      partialRiseDb: [20, 40],
      beatsHeard: 5,
    });
    expect(t.cents).toBe(12);
    expect(t.partialRiseDb).toEqual([10, 20]);
  });
});
