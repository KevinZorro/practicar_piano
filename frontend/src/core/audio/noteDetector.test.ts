import { NoteDetector } from './noteDetector';
import { afterStrike, runTrial } from './testing/evaluate';
import { analyserFrames, renderRoom } from './testing/simulate';

const room = { noiseRms: 0.002 };

describe('NoteDetector (simulated piano and room)', () => {
  it('confirms an expected note and invents nothing else', () => {
    const r = runTrial({ expected: [60], played: [60], amplitude: 0.15, room, seed: 1 });
    expect(afterStrike(r, 'hit').map((e) => e.pitch)).toEqual([60]);
    expect(afterStrike(r, 'wrong')).toEqual([]);
  });

  it('confirms every note of a chord, low notes included', () => {
    const notes = [40, 47, 52, 56];
    const r = runTrial({ expected: notes, played: notes, amplitude: 0.15, room, seed: 2 });
    expect(
      afterStrike(r, 'hit')
        .map((e) => e.pitch)
        .sort(),
    ).toEqual(notes);
    expect(afterStrike(r, 'wrong')).toEqual([]);
  });

  it.each([
    ['a semitone below', 59],
    ['a semitone above', 61],
    ['a fifth above', 67],
    ['an octave above', 72],
    ['an octave below', 48],
  ])('does not accept the expected C4 when %s is played, and flags the wrong note', (_, played) => {
    const r = runTrial({ expected: [60], played: [played], amplitude: 0.15, room, seed: 3 });
    expect(afterStrike(r, 'hit')).toEqual([]);
    expect(afterStrike(r, 'wrong').map((e) => e.pitch)).toEqual([played]);
  });

  it('hears nothing in a quiet room and nothing in noise', () => {
    for (const noiseRms of [0.001, 0.006]) {
      const signal = renderRoom(8, [], { noiseRms, hum: 0.003 }, 4);
      const detector = new NoteDetector();
      detector.setExpected([48, 55, 60]);
      let events = 0;
      for (const frame of analyserFrames(signal, 8192, 0.02))
        events += detector.process(frame).length;
      expect(events).toBe(0);
    }
  });

  it('hears a repeated note twice but not the ringing of the first strike', () => {
    const signal = renderRoom(
      3.2,
      [
        { pitch: 60, startS: 1, amplitude: 0.15 },
        { pitch: 60, startS: 1.9, amplitude: 0.15 },
      ],
      room,
      5,
    );
    const detector = new NoteDetector();
    detector.setExpected([60]);
    const hits: number[] = [];
    for (const frame of analyserFrames(signal, 8192, 0.02)) {
      for (const e of detector.process(frame)) if (e.kind === 'hit') hits.push(e.onsetS);
    }
    expect(hits).toHaveLength(2);
    expect(hits[0]).toBeGreaterThan(1);
    expect(hits[1]).toBeGreaterThan(1.9);
  });

  it('decides within about 200 ms of the strike', () => {
    const r = runTrial({ expected: [64], played: [64], amplitude: 0.15, room, seed: 6 });
    const hit = afterStrike(r, 'hit')[0];
    expect(hit).toBeDefined();
    expect((hit?.timeS ?? 99) - r.strikeS).toBeLessThan(0.2);
  });

  it('ignores a note that was not expected only when it is not clearly there', () => {
    // Very quiet: under the absolute floor, nothing is reported either way.
    const r = runTrial({ expected: [60], played: [67], amplitude: 0.0002, room, seed: 7 });
    expect(afterStrike(r, 'wrong')).toEqual([]);
    expect(afterStrike(r, 'hit')).toEqual([]);
  });
});
