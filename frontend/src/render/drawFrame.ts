import type { Hand, Note } from '../core/notes/model';
import { HIGHEST_PITCH, LOWEST_PITCH } from '../core/notes/model';
import { isBlackKey, keyBox } from './keyboardLayout';
import { noteName, noteNameWithOctave } from './noteNames';
import { noteRect, type View } from './projection';

/** The Canvas 2D calls we use, so tests can record them. */
export interface Drawing {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

export const HAND_COLORS = { left: '#4cc9f0', right: '#f72585' } as const;
/** A key the player is holding down on their own keyboard. */
export const PRESSED_COLOR = '#ffd166';
export const KEYBOARD_HEIGHT = 110;

const HIT_LINE_COLOR = '#ffffff';
const LANE_COLOR = '#222233';
const OCTAVE_LINE_COLOR = '#34344c';
const WHITE_KEY = '#f4f4fa';
const BLACK_KEY = '#14141d';
const LABEL_ON_WHITE = '#4a4a5e';
const BLACK_KEY_HEIGHT_RATIO = 0.62;
const MIN_LABEL_NOTE_HEIGHT = 16;
const MIN_LABEL_NOTE_WIDTH = 14;

export interface FrameOptions {
  /** Pitches the player is holding on their keyboard. */
  readonly pressed?: ReadonlySet<number>;
}

/**
 * Draws the lanes, the falling notes, the hit line and the keyboard below it.
 * `view.height` is the falling area; the keyboard takes `KEYBOARD_HEIGHT` px under it.
 * Returns how many notes were drawn.
 */
export function drawFrame(
  ctx: Drawing,
  notes: readonly Note[],
  nowS: number,
  view: View,
  options: FrameOptions = {},
): number {
  ctx.clearRect(0, 0, view.width, view.height + KEYBOARD_HEIGHT + 2);
  drawLanes(ctx, view);

  const sounding = new Map<number, Hand>();
  let drawn = 0;
  for (const note of notes) {
    const rect = noteRect(note, nowS, view);
    if (!rect) continue;
    const active = note.startS <= nowS && nowS < note.endS;
    if (active) sounding.set(note.pitch, note.hand);
    drawNote(ctx, note, rect, active);
    drawn++;
  }

  ctx.fillStyle = HIT_LINE_COLOR;
  ctx.fillRect(0, view.height, view.width, 2);
  drawKeyboard(ctx, view, sounding, options.pressed ?? new Set());
  return drawn;
}

function drawLanes(ctx: Drawing, view: View): void {
  for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
    if (!isBlackKey(pitch)) continue;
    const key = keyBox(pitch, view.width);
    ctx.fillStyle = LANE_COLOR;
    ctx.fillRect(key.x, 0, key.width, view.height);
  }
  // A line at every C, so the octaves can be told apart at a glance.
  for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
    if (pitch % 12 !== 0) continue;
    ctx.fillStyle = OCTAVE_LINE_COLOR;
    ctx.fillRect(keyBox(pitch, view.width).x, 0, 1, view.height);
  }
}

function drawNote(
  ctx: Drawing,
  note: Note,
  rect: { x: number; y: number; width: number; height: number },
  active: boolean,
): void {
  const color = HAND_COLORS[note.hand];
  const inset = 1;
  const x = rect.x + inset;
  const width = Math.max(rect.width - inset * 2, 1);
  if (active) {
    // A halo and a white border instead of a blur: blurs are very slow without a GPU.
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x - 3, rect.y - 3, width + 6, rect.height + 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, rect.y, width, rect.height);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, rect.y + 2, Math.max(width - 4, 1), Math.max(rect.height - 4, 1));
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x, rect.y, width, rect.height);
  }
  if (rect.height >= MIN_LABEL_NOTE_HEIGHT && width >= MIN_LABEL_NOTE_WIDTH) {
    ctx.fillStyle = '#10101a';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(noteName(note.pitch), x + width / 2, rect.y + rect.height - 4);
  }
}

function keyColor(
  pitch: number,
  base: string,
  sounding: ReadonlyMap<number, Hand>,
  pressed: ReadonlySet<number>,
): string {
  if (pressed.has(pitch)) return PRESSED_COLOR;
  const hand = sounding.get(pitch);
  return hand ? HAND_COLORS[hand] : base;
}

function drawKeyboard(
  ctx: Drawing,
  view: View,
  sounding: ReadonlyMap<number, Hand>,
  pressed: ReadonlySet<number>,
): void {
  const top = view.height + 2;
  const height = KEYBOARD_HEIGHT;
  for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
    if (isBlackKey(pitch)) continue;
    const key = keyBox(pitch, view.width);
    ctx.fillStyle = keyColor(pitch, WHITE_KEY, sounding, pressed);
    ctx.fillRect(key.x + 0.5, top, key.width - 1, height);
    ctx.fillStyle = LABEL_ON_WHITE;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const label = pitch % 12 === 0 ? noteNameWithOctave(pitch) : noteName(pitch);
    ctx.fillText(label, key.x + key.width / 2, top + height - 6);
  }
  for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
    if (!isBlackKey(pitch)) continue;
    const key = keyBox(pitch, view.width);
    ctx.fillStyle = keyColor(pitch, BLACK_KEY, sounding, pressed);
    ctx.fillRect(key.x, top, key.width, height * BLACK_KEY_HEIGHT_RATIO);
  }
}
