import type { Note } from '../core/notes/model';
import { fingerprint } from './fingerprint';

const note = (pitch: number, startS: number, endS: number): Note => ({
  id: 0,
  pitch,
  startS,
  endS,
  velocity: 80,
  hand: 'right',
});

describe('fingerprint', () => {
  it('lays the opening of a song out in time and pitch, coloured by letter', () => {
    const bars = fingerprint([note(64, 1, 2), note(60, 0, 1)], {
      width: 120,
      height: 40,
      spanS: 12,
    });
    expect(bars).toHaveLength(2);
    const [c, e] = bars;
    expect(c).toMatchObject({ x: 0, letter: 'C', width: 9 });
    expect(e).toMatchObject({ x: 10, letter: 'E' });
    // Higher notes sit higher.
    expect(e?.y).toBeLessThan(c?.y ?? 0);
  });

  it('shows only the first seconds and a bounded number of notes', () => {
    const many = Array.from({ length: 50 }, (_, i) => note(60 + (i % 12), i * 0.5, i * 0.5 + 0.4));
    expect(fingerprint(many, { width: 100, height: 30, spanS: 5 })).toHaveLength(10);
    expect(fingerprint(many, { width: 100, height: 30, spanS: 60, maxBars: 7 })).toHaveLength(7);
  });

  it('cuts a long note at the edge and keeps tiny notes visible', () => {
    const [long] = fingerprint([note(60, 0, 30)], { width: 100, height: 30, spanS: 10 });
    expect(long?.width).toBe(99);
    const [tiny] = fingerprint([note(60, 0, 0.001)], { width: 100, height: 30, spanS: 10 });
    expect(tiny?.width).toBe(2);
  });

  it('is empty for a song without notes', () => {
    expect(fingerprint([], { width: 100, height: 30 })).toEqual([]);
  });
});
