/** A bar of the score and the song time where it starts (as the server sends it). */
export interface MeasureStart {
  readonly measure: number;
  readonly start_s: number;
}

// Measure starts come from float arithmetic on the server (the first one can be -2.6e-16).
const EPSILON_S = 1e-6;

/** Number of the measure that sounds at `timeS`, or null before the first one. */
export function measureAt(measures: readonly MeasureStart[], timeS: number): number | null {
  let found: number | null = null;
  for (const m of measures) {
    if (m.start_s > timeS + EPSILON_S) break;
    found = m.measure;
  }
  return found;
}

/** Song time as a clock: 65 -> "1:05", 600 -> "10:00". Negative or unknown times read 0:00. */
export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes)}:${String(rest).padStart(2, '0')}`;
}
