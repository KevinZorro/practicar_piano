import type { Note } from '../notes/model';

/**
 * Finds the notes whose start the playhead has just crossed, so a synth can sound them.
 * Seeking back or far ahead restarts from the new position without a burst of old notes.
 */
export class NoteTrigger {
  private lastS = -Infinity;

  constructor(
    private readonly notes: readonly Note[],
    private readonly maxJumpS = 0.5,
  ) {}

  /** Notes with a start in (last, nowS]. Call every frame while playing. */
  advance(nowS: number): Note[] {
    const last = this.lastS;
    this.lastS = nowS;
    if (nowS < last || nowS - last > this.maxJumpS) return [];
    return this.notes.filter((n) => n.startS > last && n.startS <= nowS);
  }

  reset(): void {
    this.lastS = -Infinity;
  }
}
