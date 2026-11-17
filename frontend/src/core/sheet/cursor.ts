import type { ResultResponse } from '../../adapters/api/jobsApi';

type ScoreOut = NonNullable<ResultResponse['levels'][number]['score']>;
export type MeasureTime = ScoreOut['measures'][number];

const BEATS_PER_MEASURE = 4;

/** Index of the last step that starts at or before `timeS`, or -1 before the first. */
export function stepIndexAt(stepStartsS: readonly number[], timeS: number): number {
  let low = 0;
  let high = stepStartsS.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((stepStartsS[mid] ?? Infinity) <= timeS) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * Seconds at which each cursor step starts. `stepWholeNotes` are the notation positions the
 * renderer reports (in whole notes, from the start of the piece); the tempo is constant, so a
 * position maps to time linearly, anchored at the start of the first measure.
 */
export function stepStartsFromNotation(
  stepWholeNotes: readonly number[],
  tempoBpm: number,
  firstMeasureStartS: number,
): number[] {
  const wholeNoteS = (60 / tempoBpm) * BEATS_PER_MEASURE;
  return stepWholeNotes.map((whole) => firstMeasureStartS + whole * wholeNoteS);
}

export interface MeasurePosition {
  /** 1-based, as in the MusicXML. */
  readonly measure: number;
  /** How far into the measure, 0 to 1. */
  readonly fraction: number;
}

/** The measure under the video time, or null before the score starts or after it ends. */
export function measureAt(
  timemap: readonly MeasureTime[],
  tempoBpm: number,
  timeS: number,
): MeasurePosition | null {
  const index = stepIndexAt(
    timemap.map((m) => m.start_s),
    timeS,
  );
  const current = timemap[index];
  if (!current) return null;
  const next = timemap[index + 1];
  const length = next ? next.start_s - current.start_s : (60 / tempoBpm) * BEATS_PER_MEASURE;
  if (timeS >= current.start_s + length) return null;
  return { measure: current.measure, fraction: (timeS - current.start_s) / length };
}
