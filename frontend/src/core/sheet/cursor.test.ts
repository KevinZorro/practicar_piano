import { describe, expect, it } from 'vitest';
import { measureAt, stepIndexAt, stepStartsFromNotation } from './cursor';

const timemap = [
  { measure: 1, start_s: 2 },
  { measure: 2, start_s: 4 },
  { measure: 3, start_s: 6 },
];

describe('stepIndexAt', () => {
  const starts = [2, 2.5, 3, 4];
  it('is -1 before the first step', () => {
    expect(stepIndexAt(starts, 1.99)).toBe(-1);
    expect(stepIndexAt([], 5)).toBe(-1);
  });
  it('picks the last step already started', () => {
    expect(stepIndexAt(starts, 2)).toBe(0);
    expect(stepIndexAt(starts, 2.7)).toBe(1);
    expect(stepIndexAt(starts, 3)).toBe(2);
    expect(stepIndexAt(starts, 99)).toBe(3);
  });
});

describe('stepStartsFromNotation', () => {
  it('maps whole notes to seconds from the first measure start', () => {
    // 120 bpm: a beat is 0.5 s, a whole note 2 s
    expect(stepStartsFromNotation([0, 0.25, 1], 120, 2)).toEqual([2, 2.5, 4]);
  });
});

describe('measureAt', () => {
  it('finds the measure and how far into it', () => {
    expect(measureAt(timemap, 120, 4.5)).toEqual({ measure: 2, fraction: 0.25 });
    expect(measureAt(timemap, 120, 2)).toEqual({ measure: 1, fraction: 0 });
  });
  it('is null before the start and after the last measure', () => {
    expect(measureAt(timemap, 120, 1)).toBeNull();
    expect(measureAt(timemap, 120, 8)).toBeNull();
    expect(measureAt([], 120, 3)).toBeNull();
  });
  it('gives the last measure four beats at the song tempo', () => {
    expect(measureAt(timemap, 120, 7.9)?.measure).toBe(3);
  });
});
