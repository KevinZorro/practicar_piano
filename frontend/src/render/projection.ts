import type { Note } from '../core/notes/model';
import { FULL_RANGE, keyBox, type KeyRange } from './keyboardLayout';

export interface View {
  readonly width: number;
  /** Height of the falling area; the hit line is at its bottom edge. */
  readonly height: number;
  /** Seconds of song visible above the hit line. */
  readonly aheadS: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Vertical pixel of song time `timeS` when the clock reads `nowS`. */
export function timeToY(timeS: number, nowS: number, view: View): number {
  return view.height * (1 - (timeS - nowS) / view.aheadS);
}

const MIN_NOTE_HEIGHT = 3;

/** Rectangle of a falling note, or null when it is outside the visible area or keyboard. */
export function noteRect(
  note: Note,
  nowS: number,
  view: View,
  range: KeyRange = FULL_RANGE,
): Rect | null {
  const bottom = timeToY(note.startS, nowS, view); // start is the lower edge
  const top = timeToY(note.endS, nowS, view);
  if (bottom < 0 || top > view.height) return null;
  if (note.pitch < range.low || note.pitch > range.high) return null;
  const key = keyBox(note.pitch, view.width, range);
  const height = Math.max(bottom - top, MIN_NOTE_HEIGHT);
  return { x: key.x, y: bottom - height, width: key.width, height };
}
