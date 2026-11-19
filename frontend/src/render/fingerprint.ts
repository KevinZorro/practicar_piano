import type { Note } from '../core/notes/model';
import { letterOf, type Letter } from '../core/notes/names';

/** One note of a song's miniature: time runs left to right, higher notes sit higher. */
export interface FingerprintBar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly letter: Letter;
}

export interface FingerprintOptions {
  readonly width: number;
  readonly height: number;
  /** Seconds of music shown, from the first note. */
  readonly spanS?: number;
  /** Keeps the drawing light for long, dense songs. */
  readonly maxBars?: number;
}

const DEFAULT_SPAN_S = 12;
const DEFAULT_MAX_BARS = 160;
const PITCH_PADDING = 2;
const MIN_BAR = 2;
const MIN_ROW = 3;
const BAR_GAP = 1;

/**
 * The opening of a song as coloured bars, so each card in the library is recognisable at a
 * glance. Pure geometry; the library draws it as SVG.
 */
export function fingerprint(notes: readonly Note[], options: FingerprintOptions): FingerprintBar[] {
  const spanS = options.spanS ?? DEFAULT_SPAN_S;
  const maxBars = options.maxBars ?? DEFAULT_MAX_BARS;
  const sorted = [...notes].sort((a, b) => a.startS - b.startS);
  const first = sorted[0];
  if (!first) return [];
  const startS = first.startS;
  const shown = sorted.filter((n) => n.startS < startS + spanS).slice(0, maxBars);
  const pitches = shown.map((n) => n.pitch);
  const low = Math.min(...pitches) - PITCH_PADDING;
  const high = Math.max(...pitches) + PITCH_PADDING;
  const row = options.height / (high - low + 1);
  const perSecond = options.width / spanS;
  return shown.map((n) => {
    const x = (n.startS - startS) * perSecond;
    const end = Math.min(n.endS, startS + spanS);
    return {
      x,
      y: (high - n.pitch) * row,
      width: Math.max(MIN_BAR, (end - n.startS) * perSecond - BAR_GAP),
      height: Math.max(MIN_ROW, row),
      letter: letterOf(n.pitch),
    };
  });
}
