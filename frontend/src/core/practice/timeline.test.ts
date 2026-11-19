import { formatClock, measureAt } from './timeline';

const measures = [
  { measure: 1, start_s: -2.6e-16 },
  { measure: 2, start_s: 1.9999999999999998 },
  { measure: 3, start_s: 4 },
];

describe('measureAt', () => {
  it('names the measure that sounds at a time, counting float noise as the start', () => {
    expect(measureAt(measures, 0)).toBe(1);
    expect(measureAt(measures, 1.99)).toBe(1);
    expect(measureAt(measures, 2)).toBe(2);
    expect(measureAt(measures, 99)).toBe(3);
  });

  it('is null before the first measure or without a score', () => {
    expect(measureAt([{ measure: 1, start_s: 1 }], 0.5)).toBeNull();
    expect(measureAt([], 3)).toBeNull();
  });
});

describe('formatClock', () => {
  it('writes minutes and two-digit seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(600)).toBe('10:00');
  });

  it('reads 0:00 for negative or unknown times', () => {
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
});
