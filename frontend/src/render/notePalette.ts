import { letterOf, type Letter } from '../core/notes/names';

/**
 * One colour per note, like the bars of a school metalófono: the falling bar, the lit key, the
 * notehead on the staff and its letter share it, so the colour is the bridge between the keys
 * and the staff. A note keeps the colour of the letter it is written on (C♯ is red like C).
 * Calibrated in OKLCH to an even weight; `INK` reads at 5.7:1 or more on every stage colour.
 */
export const STAGE_COLORS: Readonly<Record<Letter, string>> = {
  C: '#f56056',
  D: '#f89845',
  E: '#f3d146',
  F: '#71d268',
  G: '#3fc8c4',
  A: '#5aa6f2',
  B: '#c184e5',
};

/**
 * The same family, deep enough for the white page: the letters under the staff are small text,
 * so every colour reads at 4.5:1 or more there, noteheads included.
 */
export const PAPER_COLORS: Readonly<Record<Letter, string>> = {
  C: '#d02c2a',
  D: '#b85801',
  E: '#926e06',
  F: '#168629',
  G: '#058181',
  A: '#226bc0',
  B: '#8c42aa',
};

/** Text on a coloured bar or key. */
export const INK = '#1a1511';

export function stageColor(pitch: number): string {
  return STAGE_COLORS[letterOf(pitch)];
}

export function paperColor(letter: Letter): string {
  return PAPER_COLORS[letter];
}
