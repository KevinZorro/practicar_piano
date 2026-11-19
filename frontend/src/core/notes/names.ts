import type { NamingStyle } from '../practice/prefs';

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * How each pitch class is written. It matches music21's default spelling, which the server
 * uses for the score, so a black key carries the same name on the keys and on the staff.
 */
const SPELLING: readonly (readonly [Letter, -1 | 0 | 1])[] = [
  ['C', 0],
  ['C', 1],
  ['D', 0],
  ['E', -1],
  ['E', 0],
  ['F', 0],
  ['F', 1],
  ['G', 0],
  ['G', 1],
  ['A', 0],
  ['B', -1],
  ['B', 0],
];

const SOLFEGE: Record<Letter, string> = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
};

const ASCII_ALTER = { [-1]: 'b', 0: '', 1: '#' } as const;
const SIGN_ALTER = { [-1]: '♭', 0: '', 1: '♯' } as const;

function spelled(pitch: number): readonly [Letter, -1 | 0 | 1] {
  return SPELLING[((pitch % 12) + 12) % 12] ?? ['C', 0];
}

/** The letter a pitch is written on, without its accidental: 61 (C#) -> "C", 63 (Eb) -> "E". */
export function letterOf(pitch: number): Letter {
  return spelled(pitch)[0];
}

/** Letter name of a MIDI pitch in plain ASCII, e.g. 60 -> "C", 61 -> "C#", 70 -> "Bb". */
export function noteName(pitch: number): string {
  const [letter, alter] = spelled(pitch);
  return letter + ASCII_ALTER[alter];
}

/** Name with its octave in scientific notation, e.g. 60 -> "C4", 21 -> "A0". */
export function noteNameWithOctave(pitch: number): string {
  return `${noteName(pitch)}${String(Math.floor(pitch / 12) - 1)}`;
}

/** A written note's name as the player reads it: "C♯" with letters, "Do♯" with solfège. */
export function writtenName(letter: Letter, alter: number, style: NamingStyle): string {
  const base = style === 'solfege' ? SOLFEGE[letter] : letter;
  const sign = alter > 0 ? '♯'.repeat(alter) : '♭'.repeat(-alter);
  return base + sign;
}

/** Display name of a MIDI pitch, e.g. 63 -> "E♭" or "Mi♭". */
export function displayName(pitch: number, style: NamingStyle): string {
  const [letter, alter] = spelled(pitch);
  return (style === 'solfege' ? SOLFEGE[letter] : letter) + SIGN_ALTER[alter];
}

/** Both names side by side, for explanations: "C (Do)". */
export function bothNames(pitch: number): string {
  return `${displayName(pitch, 'letters')} (${displayName(pitch, 'solfege')})`;
}
