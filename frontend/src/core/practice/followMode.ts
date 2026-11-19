import type { PlaybackClock } from '../clock/playbackClock';
import {
  filterByHand,
  groupIntoChords,
  type Chord,
  type HandFilter,
  type Note,
} from '../notes/model';

export interface FollowConfig {
  /** Seconds the song goes back after a mistake. */
  readonly rewindS: number;
  /** A chord of which no note was played also counts as a mistake. */
  readonly rewindOnMiss: boolean;
  /** A key counts for a note when it lands within this many seconds of it. */
  readonly windowS: number;
  /**
   * After going back, mistakes are ignored until the song has moved this far past the
   * landing point. A video that is still loading cannot trigger a string of rewinds.
   */
  readonly coolOffS: number;
}

export const DEFAULT_FOLLOW_CONFIG: FollowConfig = {
  rewindS: 5,
  rewindOnMiss: false,
  windowS: 0.3,
  coolOffS: 0.6,
};

export interface FollowStats {
  readonly hits: number;
  readonly mistakes: number;
  readonly rewinds: number;
}

/**
 * Practice that follows the video: the song never waits, it keeps playing at its own pace
 * (the video is the reference, the transcription is only the answer key). A key that matches
 * no note of the song around that moment, or, if chosen, a chord that went by unplayed, sends
 * the song back by `rewindS` seconds.
 */
export class FollowMode {
  private readonly notes: readonly Note[];
  private readonly chords: readonly Chord[];
  private readonly matched = new Set<number>();
  private pointer = 0;
  private coolUntilS = -Infinity;
  /** Missed chords only count once the player has pressed a key in this run. */
  private armed = false;
  private stats: FollowStats = { hits: 0, mistakes: 0, rewinds: 0 };

  constructor(
    notes: readonly Note[],
    hand: HandFilter,
    private readonly clock: PlaybackClock,
    private readonly onChange: (stats: FollowStats) => void,
    private readonly config: FollowConfig = DEFAULT_FOLLOW_CONFIG,
  ) {
    this.notes = filterByHand(notes, hand);
    this.chords = groupIntoChords(this.notes);
    this.pointer = this.firstChordFrom(clock.now());
  }

  get snapshot(): FollowStats {
    return this.stats;
  }

  noteOn(pitch: number, timeS: number): void {
    this.armed = true;
    const note = this.nearest(pitch, timeS);
    if (note) {
      this.matched.add(note.id);
      this.stats = { ...this.stats, hits: this.stats.hits + 1 };
      this.onChange(this.stats);
      return;
    }
    this.mistake();
  }

  /** Call every frame while the player is practicing. */
  tick(): void {
    if (!this.config.rewindOnMiss || !this.armed) return;
    const now = this.clock.now();
    while (this.pointer < this.chords.length) {
      const chord = this.chords[this.pointer];
      if (!chord || chord.startS + this.config.windowS >= now) return;
      this.pointer++;
      if (!chord.notes.some((n) => this.matched.has(n.id))) {
        this.mistake();
        return;
      }
    }
  }

  /** Call when the player moves the position by hand (restart, timeline). */
  seek(timeS: number): void {
    this.matched.clear();
    this.pointer = this.firstChordFrom(timeS);
    this.coolUntilS = -Infinity;
    this.armed = false;
  }

  private mistake(): void {
    const now = this.clock.now();
    // While a rewind is still settling, the video is loading: do not pile up more.
    if (now < this.coolUntilS) return;
    const target = Math.max(0, now - this.config.rewindS);
    this.stats = {
      ...this.stats,
      mistakes: this.stats.mistakes + 1,
      rewinds: this.stats.rewinds + 1,
    };
    for (const note of this.notes) if (note.startS >= target) this.matched.delete(note.id);
    this.pointer = this.firstChordFrom(target);
    this.coolUntilS = target + this.config.coolOffS;
    this.clock.seek(target);
    this.onChange(this.stats);
  }

  private nearest(pitch: number, timeS: number): Note | null {
    let best: Note | null = null;
    for (const note of this.notes) {
      if (note.pitch !== pitch || this.matched.has(note.id)) continue;
      const distance = Math.abs(note.startS - timeS);
      if (distance <= this.config.windowS && (!best || distance < Math.abs(best.startS - timeS))) {
        best = note;
      }
    }
    return best;
  }

  private firstChordFrom(timeS: number): number {
    const index = this.chords.findIndex((c) => c.startS >= timeS);
    return index === -1 ? this.chords.length : index;
  }
}

/** Share of keys that were right, in [0, 1]; 1 when nothing was played. */
export function followAccuracy(stats: FollowStats): number {
  const total = stats.hits + stats.mistakes;
  return total === 0 ? 1 : stats.hits / total;
}
