import { HIGHEST_PITCH, LOWEST_PITCH } from '../core/notes/model';

export interface KeyBox {
  readonly x: number;
  readonly width: number;
  readonly isBlack: boolean;
}

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const BLACK_WIDTH_RATIO = 0.6;

export function isBlackKey(pitch: number): boolean {
  return BLACK_PITCH_CLASSES.has(pitch % 12);
}

/** White keys between the lowest key and `pitch` (exclusive), i.e. the white-key index. */
function whiteIndex(pitch: number): number {
  let index = 0;
  for (let p = LOWEST_PITCH; p < pitch; p++) if (!isBlackKey(p)) index++;
  return index;
}

export const WHITE_KEY_COUNT = whiteIndex(HIGHEST_PITCH + 1);

/**
 * Horizontal position of a key on an 88-key keyboard drawn `totalWidth` pixels wide.
 * Black keys are centred on the boundary between their two neighbouring white keys.
 */
export function keyBox(pitch: number, totalWidth: number): KeyBox {
  if (pitch < LOWEST_PITCH || pitch > HIGHEST_PITCH) {
    throw new RangeError(`pitch ${String(pitch)} is outside the 88-key range`);
  }
  const white = totalWidth / WHITE_KEY_COUNT;
  if (!isBlackKey(pitch)) return { x: whiteIndex(pitch) * white, width: white, isBlack: false };
  const width = white * BLACK_WIDTH_RATIO;
  return { x: whiteIndex(pitch) * white - width / 2, width, isBlack: true };
}
