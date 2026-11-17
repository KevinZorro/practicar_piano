import type { Hand, Note } from './model';

let nextId = 0;
export function note(
  pitch: number,
  startS: number,
  endS = startS + 0.5,
  hand: Hand = 'right',
): Note {
  return { id: nextId++, pitch, startS, endS, velocity: 80, hand };
}
