import type { Note } from '../notes/model';

export const JUDGE_WINDOW_S = 0.3;

export interface Judgement {
  /** Notes that had time to be played in the span. */
  readonly expected: number;
  readonly hit: number;
  /** Keys that matched no note of the song. */
  readonly extra: number;
  /** hit / (expected + extra), in [0, 1]; 1 when nothing was due. */
  readonly accuracy: number;
}

/**
 * Judges free play (no waiting): a key counts when the song has that pitch within a short
 * window of the press. Keys that match nothing count against the player, so mashing every
 * key does not score well.
 */
export class Judge {
  private readonly matched = new Set<number>();
  private extra = 0;
  private presses = 0;

  constructor(
    private readonly notes: readonly Note[],
    private fromS = 0,
    private readonly windowS = JUDGE_WINDOW_S,
  ) {}

  /** Starts over from `fromS` (restart or seek). */
  reset(fromS: number): void {
    this.matched.clear();
    this.extra = 0;
    this.presses = 0;
    this.fromS = fromS;
  }

  noteOn(pitch: number, timeS: number): void {
    this.presses++;
    let best: Note | null = null;
    for (const note of this.notes) {
      if (note.pitch !== pitch || this.matched.has(note.id)) continue;
      const distance = Math.abs(note.startS - timeS);
      if (distance <= this.windowS && (!best || distance < Math.abs(best.startS - timeS))) {
        best = note;
      }
    }
    if (best) this.matched.add(best.id);
    else this.extra++;
  }

  get pressCount(): number {
    return this.presses;
  }

  /** The score up to `uptoS`: only notes whose window has already closed are due. */
  result(uptoS: number): Judgement {
    const due = this.notes.filter(
      (n) => n.startS >= this.fromS && n.startS + this.windowS <= uptoS,
    );
    const hit = due.filter((n) => this.matched.has(n.id)).length;
    const total = due.length + this.extra;
    return {
      expected: due.length,
      hit,
      extra: this.extra,
      accuracy: total === 0 ? 1 : hit / total,
    };
  }
}
