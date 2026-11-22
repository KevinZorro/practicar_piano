import { isHarmonicOf, NoteDetector } from './noteDetector';
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

// Found with recorded pianos and Kevin's keyboard (2026-11-22): nothing below C3 or above G5
// was heard. See docs/phase-1/microfono-mediciones.md.
describe('NoteDetector at both ends of the keyboard', () => {
  const speaker = { noiseRms: 0.002, speakerCornerHz: 220 };

  it.each([36, 37, 38, 40, 43])(
    'confirms low note %i through small speakers and does not report its octave as wrong',
    (pitch) => {
      const r = runTrial({
        expected: [pitch],
        played: [pitch],
        amplitude: 0.2,
        room: speaker,
        seed: pitch,
      });
      expect(afterStrike(r, 'hit').map((e) => e.pitch)).toEqual([pitch]);
      expect(afterStrike(r, 'wrong')).toEqual([]);
    },
  );

  it.each([36, 38, 41])('a loud low note %i does not lose to its neighbour key', (pitch) => {
    const r = runTrial({
      expected: [pitch],
      played: [pitch],
      amplitude: 0.6,
      room,
      seed: pitch + 1,
    });
    expect(afterStrike(r, 'hit').map((e) => e.pitch)).toEqual([pitch]);
    expect(afterStrike(r, 'wrong')).toEqual([]);
  });

  it.each([81, 84, 86, 88, 91, 93, 96])('confirms high note %i', (pitch) => {
    const r = runTrial({ expected: [pitch], played: [pitch], amplitude: 0.15, room, seed: pitch });
    expect(afterStrike(r, 'hit').map((e) => e.pitch)).toEqual([pitch]);
    expect(afterStrike(r, 'wrong')).toEqual([]);
  });

  it.each([
    ['C2 after F2', 41, 36],
    ['E2 after A2', 45, 40],
    ['G2 after C2', 36, 43],
    ['G2 after D2', 38, 43],
    ['B2 after G2', 43, 47],
  ])('hears %s while the previous bass note still rings', (_, before, after) => {
    const r = runTrial({
      expected: [after],
      played: [after],
      previous: [before],
      amplitude: 0.2,
      room: speaker,
      seed: before + after,
    });
    expect(afterStrike(r, 'hit').map((e) => e.pitch)).toEqual([after]);
    expect(afterStrike(r, 'wrong')).toEqual([]);
  });

  it.each([
    ['G2 expected after C2, A2 played', 36, 43, 45],
    ['C2 expected after F2, C#2 played', 41, 36, 37],
    ['E2 expected after A2, E3 played', 45, 40, 52],
  ])('%s: the expected note is not accepted', (_, before, expected, played) => {
    const r = runTrial({
      expected: [expected],
      played: [played],
      previous: [before],
      amplitude: 0.2,
      room: speaker,
      seed: before + played,
    });
    expect(afterStrike(r, 'hit')).toEqual([]);
  });

  it.each([
    ['C6 expected, C5 played (octave below)', 84, 72],
    ['C6 expected, C#6 played', 84, 85],
    ['G6 expected, G5 played', 91, 79],
    ['A6 expected, G6 played', 93, 91],
    ['C2 expected, C3 played (octave above)', 36, 48],
    ['C3 expected, C2 played (octave below)', 48, 36],
    ['E2 expected, F2 played', 40, 41],
  ])('%s: the expected note is not accepted', (_, expected, played) => {
    const r = runTrial({
      expected: [expected],
      played: [played],
      amplitude: 0.15,
      room: speaker,
      seed: played,
    });
    expect(afterStrike(r, 'hit')).toEqual([]);
  });
});

describe('isHarmonicOf', () => {
  it('knows the octave, twelfth and two octaves above, not the fifth or the octave below', () => {
    expect(isHarmonicOf(48, 36, 35)).toBe(true);
    expect(isHarmonicOf(55, 36, 35)).toBe(true);
    expect(isHarmonicOf(60, 36, 35)).toBe(true);
    expect(isHarmonicOf(43, 36, 35)).toBe(false);
    expect(isHarmonicOf(24, 36, 35)).toBe(false);
    expect(isHarmonicOf(49, 36, 35)).toBe(false);
  });
});
