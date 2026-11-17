import type { Hand } from '../notes/model';

const MIDDLE_C = 60;

/** D-08: from middle C up is the right hand, below it the left (same rule as the server). */
export function assignHand(pitch: number): Hand {
  return pitch >= MIDDLE_C ? 'right' : 'left';
}
