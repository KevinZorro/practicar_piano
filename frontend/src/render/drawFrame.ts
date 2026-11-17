import type { Note } from '../core/notes/model';
import { noteRect, type View } from './projection';

/** The Canvas 2D calls we use, so tests can record them. */
export interface Drawing {
  fillStyle: string | CanvasGradient | CanvasPattern;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export const HAND_COLORS = { left: '#4cc9f0', right: '#f72585' } as const;
const HIT_LINE_COLOR = '#ffffff';

/** Draws the falling notes and the hit line. Notes outside the view are skipped. */
export function drawFrame(ctx: Drawing, notes: readonly Note[], nowS: number, view: View): number {
  ctx.clearRect(0, 0, view.width, view.height + 2);
  let drawn = 0;
  for (const note of notes) {
    const rect = noteRect(note, nowS, view);
    if (!rect) continue;
    ctx.fillStyle = HAND_COLORS[note.hand];
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    drawn++;
  }
  ctx.fillStyle = HIT_LINE_COLOR;
  ctx.fillRect(0, view.height, view.width, 2);
  return drawn;
}
