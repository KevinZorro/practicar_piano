import type { Hand, Note } from '../core/notes/model';
import type { NamingStyle } from '../core/practice/prefs';
import { FULL_RANGE, isBlackKey, keyBox, type KeyRange } from './keyboardLayout';
import { displayName } from '../core/notes/names';
import { INK, stageColor } from './notePalette';
import { noteRect, type Rect, type View } from './projection';

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
  measureText(text: string): { readonly width: number };
  beginPath(): void;
  roundRect(x: number, y: number, w: number, h: number, radius: number): void;
  fill(): void;
}

export const KEYBOARD_HEIGHT = 110;
/** Space between the hit line and the keys. */
export const HIT_GAP = 4;

export const FONT_FAMILY =
  '"Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Next", system-ui, sans-serif';

/** The stage is always the dark case of the instrument; notes and keys carry the colour. */
export const STAGE = {
  ground: '#18120f',
  blackLane: '#130e0b',
  octaveLine: '#332c28',
  middleLine: '#5a514b',
  label: '#a59d95',
  hitLine: '#f1e7d2',
  whiteKey: '#f4f0e7',
  whiteKeyLabel: '#49403b',
  blackKey: '#2b241f',
  outline: '#f1e7d2',
} as const;

const MIDDLE_C = 60;
const BLACK_KEY_HEIGHT_RATIO = 0.62;
const DIMMED_ALPHA = 0.22;
const PRESSED_SHADE = 0.2;
const MIN_LABEL_NOTE_HEIGHT = 16;
const MIN_LABEL_NOTE_WIDTH = 13;
const LABEL_BACKING_ALPHA = 0.85;
const LABEL_PAD = 3;

export interface FrameOptions {
  /** Pitches the player is holding on their keyboard. */
  readonly pressed?: ReadonlySet<number>;
  /** Keys on screen; defaults to the full piano. */
  readonly range?: KeyRange;
  readonly keyboardHeight?: number;
  readonly naming?: NamingStyle;
  /** Notes of this hand are drawn faint: wait mode only asks for the other one. */
  readonly dimHand?: Hand | null;
}

/**
 * Draws the lanes, the falling notes, the hit line and the keyboard below it.
 * `view.height` is the falling area; the keyboard sits `HIT_GAP` px under it.
 * Returns how many notes were drawn.
 */
export function drawFrame(
  ctx: Drawing,
  notes: readonly Note[],
  nowS: number,
  view: View,
  options: FrameOptions = {},
): number {
  const range = options.range ?? FULL_RANGE;
  const keyboardHeight = options.keyboardHeight ?? KEYBOARD_HEIGHT;
  const naming = options.naming ?? 'letters';
  const total = view.height + HIT_GAP + keyboardHeight;
  ctx.clearRect(0, 0, view.width, total);
  ctx.fillStyle = STAGE.ground;
  ctx.fillRect(0, 0, view.width, total);
  if (view.height > 0) drawLanes(ctx, view, range);

  const sounding = new Set<number>();
  let drawn = 0;
  for (const note of notes) {
    const active = note.startS <= nowS && nowS < note.endS;
    const dimmed = options.dimHand === note.hand;
    if (active && !dimmed) sounding.add(note.pitch);
    const rect = view.height > 0 ? noteRect(note, nowS, view, range) : null;
    if (!rect) continue;
    drawNote(ctx, note, rect, { active, dimmed, naming });
    drawn++;
  }
  // Over the notes, so a bar entering at the top never hides where an octave or a hand is.
  if (view.height > 0) drawLaneLabels(ctx, view, range, naming);

  ctx.fillStyle = STAGE.hitLine;
  ctx.fillRect(0, view.height, view.width, 2);
  const keys = { top: view.height + HIT_GAP, height: keyboardHeight };
  drawKeyboard(ctx, view.width, keys, range, {
    sounding,
    pressed: options.pressed ?? new Set(),
    naming,
  });
  return drawn;
}

function drawLanes(ctx: Drawing, view: View, range: KeyRange): void {
  for (let pitch = range.low; pitch <= range.high; pitch++) {
    if (!isBlackKey(pitch)) continue;
    const key = keyBox(pitch, view.width, range);
    ctx.fillStyle = STAGE.blackLane;
    ctx.fillRect(key.x, 0, key.width, view.height);
  }
  // A line at every C, so the octaves can be told apart at a glance; middle C splits the hands.
  for (let pitch = range.low; pitch <= range.high; pitch++) {
    if (pitch % 12 !== 0) continue;
    const x = keyBox(pitch, view.width, range).x;
    const middle = pitch === MIDDLE_C;
    ctx.fillStyle = middle ? STAGE.middleLine : STAGE.octaveLine;
    ctx.fillRect(x, 0, middle ? 2 : 1, view.height);
  }
}

function drawLaneLabels(ctx: Drawing, view: View, range: KeyRange, naming: NamingStyle): void {
  ctx.font = `600 11px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';
  for (let pitch = range.low; pitch <= range.high; pitch++) {
    if (pitch % 12 !== 0) continue;
    const x = keyBox(pitch, view.width, range).x;
    drawLabel(ctx, octaveLabel(pitch, naming), x + 5, 8, 'left');
  }
  const middle = MIDDLE_C >= range.low && MIDDLE_C <= range.high;
  if (middle && view.width >= 480) {
    const x = keyBox(MIDDLE_C, view.width, range).x;
    drawLabel(ctx, 'mano izquierda', x - 8, 26, 'right');
    drawLabel(ctx, 'mano derecha', x + 8, 26, 'left');
  }
}

/** A small caption on a dark backing, readable even over a coloured note. */
function drawLabel(
  ctx: Drawing,
  text: string,
  x: number,
  y: number,
  align: 'left' | 'right',
): void {
  const width = ctx.measureText(text).width;
  const left = align === 'left' ? x : x - width;
  ctx.globalAlpha = LABEL_BACKING_ALPHA;
  ctx.fillStyle = STAGE.ground;
  ctx.beginPath();
  ctx.roundRect(left - LABEL_PAD, y - LABEL_PAD, width + LABEL_PAD * 2, 11 + LABEL_PAD * 2, 4);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = STAGE.label;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function octaveLabel(pitch: number, naming: NamingStyle): string {
  return `${displayName(pitch, naming)}${String(Math.floor(pitch / 12) - 1)}`;
}

function drawNote(
  ctx: Drawing,
  note: Note,
  rect: Rect,
  state: { active: boolean; dimmed: boolean; naming: NamingStyle },
): void {
  const color = stageColor(note.pitch);
  const inset = rect.width > 10 ? 1.5 : 0.5;
  const x = rect.x + inset;
  const width = Math.max(rect.width - inset * 2, 1);
  const radius = Math.min(6, width / 3, rect.height / 2);
  ctx.globalAlpha = state.dimmed ? DIMMED_ALPHA : 1;
  if (state.active) {
    // The bar being struck gets a light rim instead of a glow: blurs are slow without a GPU.
    fillRound(ctx, STAGE.outline, x - 2, rect.y - 2, width + 4, rect.height + 4, radius + 2);
  }
  fillRound(ctx, color, x, rect.y, width, rect.height, radius);
  if (rect.height >= MIN_LABEL_NOTE_HEIGHT && width >= MIN_LABEL_NOTE_WIDTH) {
    ctx.fillStyle = INK;
    ctx.font = `700 ${width >= 22 ? '13' : '11'}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(displayName(note.pitch, state.naming), x + width / 2, rect.y + rect.height - 5);
  }
  ctx.globalAlpha = 1;
}

function fillRound(
  ctx: Drawing,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(r, 0));
  ctx.fill();
}

interface KeyState {
  readonly sounding: ReadonlySet<number>;
  readonly pressed: ReadonlySet<number>;
  readonly naming: NamingStyle;
}

function drawKeyboard(
  ctx: Drawing,
  width: number,
  keys: { top: number; height: number },
  range: KeyRange,
  state: KeyState,
): void {
  const { top, height } = keys;
  for (let pitch = range.low; pitch <= range.high; pitch++) {
    if (isBlackKey(pitch)) continue;
    const key = keyBox(pitch, width, range);
    const lit = state.sounding.has(pitch);
    const face = lit ? stageColor(pitch) : STAGE.whiteKey;
    fillRound(ctx, face, key.x + 0.75, top, key.width - 1.5, height, 4);
    if (!lit) {
      // The coloured sticker learners put on their keys: the colour ties the key to its notes.
      ctx.fillStyle = stageColor(pitch);
      ctx.fillRect(key.x + 3, top + height - 7, Math.max(key.width - 6, 1), 4);
    }
    if (state.pressed.has(pitch)) drawPressed(ctx, key.x + 0.75, top, key.width - 1.5, height, INK);
    if (key.width >= 11) {
      ctx.fillStyle = lit ? INK : STAGE.whiteKeyLabel;
      ctx.font = `700 ${key.width >= 26 ? '13' : '10'}px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(keyLabel(pitch, state.naming), key.x + key.width / 2, top + height - 13);
    }
  }
  const blackHeight = height * BLACK_KEY_HEIGHT_RATIO;
  for (let pitch = range.low; pitch <= range.high; pitch++) {
    if (!isBlackKey(pitch)) continue;
    const key = keyBox(pitch, width, range);
    const lit = state.sounding.has(pitch);
    fillRound(ctx, lit ? stageColor(pitch) : STAGE.blackKey, key.x, top, key.width, blackHeight, 3);
    if (!lit) {
      ctx.fillStyle = stageColor(pitch);
      ctx.fillRect(key.x + 2, top + blackHeight - 6, Math.max(key.width - 4, 1), 3);
    }
    if (state.pressed.has(pitch)) {
      drawPressed(ctx, key.x, top, key.width, blackHeight, STAGE.outline);
    }
  }
}

/** A key the player holds: shaded as if pushed down, with a bar along its top edge. */
function drawPressed(ctx: Drawing, x: number, y: number, w: number, h: number, bar: string): void {
  ctx.globalAlpha = PRESSED_SHADE;
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = bar;
  ctx.fillRect(x, y, w, 4);
}

/** White keys show their letter; each C also carries its octave (C4 is middle C). */
function keyLabel(pitch: number, naming: NamingStyle): string {
  const name = displayName(pitch, naming);
  return pitch % 12 === 0 ? `${name}${String(Math.floor(pitch / 12) - 1)}` : name;
}
