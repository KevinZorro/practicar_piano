import { isKeyboardOnly, type PracticeView } from '../core/practice/prefs';
import { HIT_GAP } from './drawFrame';

/** How the canvas is shared between the falling notes and the keyboard. */
export interface StageLayout {
  readonly fallHeight: number;
  readonly keyboardHeight: number;
  /** Seconds of music visible above the hit line. */
  readonly aheadS: number;
}

// Real keys are about 6 times longer than wide; on screen the notes need the room.
const KEY_LENGTH_PER_WIDTH = 3.4;
const MIN_KEYBOARD = 56;
const MAX_KEYBOARD = 150;
const MAX_KEYBOARD_SHARE = 0.32;
// Notes fall at about this speed, so a short note stays tall enough to read at any stage size.
const FALL_PX_PER_S = 100;
const MIN_AHEAD_S = 2.5;
const MAX_AHEAD_S = 4.5;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * Splits a `width` x `height` canvas: keys as tall as their width suggests, the rest for the
 * falling notes. With the score or the video the canvas is only the keyboard strip under them.
 */
export function stageLayout(
  width: number,
  height: number,
  whiteKeys: number,
  view: PracticeView,
): StageLayout {
  const usable = Math.max(0, height - HIT_GAP);
  if (isKeyboardOnly(view)) return { fallHeight: 0, keyboardHeight: usable, aheadS: MIN_AHEAD_S };
  const keyWidth = width / Math.max(1, whiteKeys);
  const wanted = Math.round(keyWidth * KEY_LENGTH_PER_WIDTH);
  const ceiling = Math.max(MIN_KEYBOARD, Math.min(MAX_KEYBOARD, height * MAX_KEYBOARD_SHARE));
  const keyboardHeight = Math.min(clamp(wanted, MIN_KEYBOARD, ceiling), usable);
  const fallHeight = Math.max(0, usable - keyboardHeight);
  return {
    fallHeight,
    keyboardHeight,
    aheadS: clamp(fallHeight / FALL_PX_PER_S, MIN_AHEAD_S, MAX_AHEAD_S),
  };
}
