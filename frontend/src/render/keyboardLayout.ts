import { HIGHEST_PITCH, LOWEST_PITCH } from '../core/notes/model';

export interface KeyBox {
  readonly x: number;
  readonly width: number;
  readonly isBlack: boolean;
}

/** The keys drawn on screen, inclusive. Both ends are white keys. */
export interface KeyRange {
  readonly low: number;
  readonly high: number;
}

export const FULL_RANGE: KeyRange = { low: LOWEST_PITCH, high: HIGHEST_PITCH };

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const BLACK_WIDTH_RATIO = 0.6;
const OCTAVE = 12;
/** A fitted keyboard shows at least three octaves, C to C, so a melody has room to move. */
export const MIN_FITTED_KEYS = 37;

export function isBlackKey(pitch: number): boolean {
  return BLACK_PITCH_CLASSES.has(pitch % 12);
}

/** White keys between the lowest key of `range` and `pitch` (exclusive). */
function whiteIndex(pitch: number, range: KeyRange): number {
  let index = 0;
  for (let p = range.low; p < pitch; p++) if (!isBlackKey(p)) index++;
  return index;
}

export function whiteKeyCount(range: KeyRange): number {
  return whiteIndex(range.high + 1, range);
}

export const WHITE_KEY_COUNT = whiteKeyCount(FULL_RANGE);

/**
 * Horizontal position of a key on a keyboard drawn `totalWidth` pixels wide.
 * Black keys are centred on the boundary between their two neighbouring white keys.
 */
export function keyBox(pitch: number, totalWidth: number, range: KeyRange = FULL_RANGE): KeyBox {
  if (pitch < range.low || pitch > range.high) {
    throw new RangeError(`pitch ${String(pitch)} is outside the keyboard`);
  }
  const white = totalWidth / whiteKeyCount(range);
  if (!isBlackKey(pitch)) {
    return { x: whiteIndex(pitch, range) * white, width: white, isBlack: false };
  }
  const width = white * BLACK_WIDTH_RATIO;
  return { x: whiteIndex(pitch, range) * white - width / 2, width, isBlack: true };
}

/**
 * The smallest keyboard, from a C to a C, that holds every pitch of the song and at least
 * `MIN_FITTED_KEYS` keys: wider keys are easier to read from the bench than all 88.
 */
export function fitKeyRange(pitches: Iterable<number>): KeyRange {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pitches) {
    min = Math.min(min, p);
    max = Math.max(max, p);
  }
  if (min > max) return { low: 48, high: 84 }; // nothing to fit: C3 to C6 around middle C
  let low = Math.max(Math.floor(min / OCTAVE) * OCTAVE, LOWEST_PITCH);
  let high = Math.min(Math.ceil(max / OCTAVE) * OCTAVE, HIGHEST_PITCH);
  let addAbove = true;
  while (high - low + 1 < MIN_FITTED_KEYS) {
    const canAbove = high + OCTAVE <= HIGHEST_PITCH;
    const canBelow = low - OCTAVE >= LOWEST_PITCH;
    if (!canAbove && !canBelow) break;
    if ((addAbove && canAbove) || !canBelow) high += OCTAVE;
    else low -= OCTAVE;
    addAbove = !addAbove;
  }
  return { low, high };
}
