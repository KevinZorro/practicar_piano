import type { Note } from '../notes/model';

/**
 * Pitches the player may be playing now in free play: notes that started a little ago
 * (the microphone needs time to be sure) or are about to start. Everything else sounding
 * counts as a wrong note.
 */
export function expectedNow(
  notes: readonly Note[],
  nowS: number,
  behindS = 0.7,
  aheadS = 0.2,
): number[] {
  const pitches = new Set<number>();
  for (const note of notes) {
    if (note.startS >= nowS - behindS && note.startS <= nowS + aheadS) pitches.add(note.pitch);
  }
  return [...pitches];
}
