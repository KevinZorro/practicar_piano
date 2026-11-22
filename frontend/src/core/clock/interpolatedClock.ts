import type { PlaybackClock, PlayerPort } from './playbackClock';

/** How long a seek may take to show in the player's position before the clock trusts it again. */
const SEEK_PATIENCE_MS = 3000;

export interface InterpolatedClockOptions {
  /** Monotonic wall clock in milliseconds (performance.now in the browser). */
  readonly wallMs: () => number;
  /** Errors above this many seconds snap the clock instead of being smoothed. */
  readonly snapThresholdS?: number;
  /** Share of the error corrected per `sync` call, in (0, 1]. */
  readonly correctionGain?: number;
}

/**
 * YouTube reports its position only a few times per second. Drawing straight from it would
 * look jumpy, so between reports we advance with the wall clock and, on each report, nudge
 * the estimate toward the player's value (small errors are slewed, big ones snap).
 */
export class InterpolatedClock implements PlaybackClock {
  private anchorS = 0;
  private anchorWallMs: number;
  private rate = 1;
  private playing = false;
  /** The player is loading: the position holds still until it plays again. */
  private stalled = false;
  private offsetS = 0;
  /** Where the last seek went, until the player confirms it (its position may lag behind). */
  private pendingSeekS: number | null = null;
  private pendingSinceMs = 0;
  private readonly snapThresholdS: number;
  private readonly gain: number;

  constructor(
    private readonly player: PlayerPort,
    private readonly options: InterpolatedClockOptions,
  ) {
    this.anchorWallMs = options.wallMs();
    this.snapThresholdS = options.snapThresholdS ?? 0.3;
    this.gain = options.correctionGain ?? 0.25;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Position of the video itself, without the sync offset. */
  private rawNow(): number {
    if (!this.playing || this.stalled) return this.anchorS;
    return this.anchorS + ((this.options.wallMs() - this.anchorWallMs) / 1000) * this.rate;
  }

  now(): number {
    return this.rawNow() + this.offsetS;
  }

  /** User sync adjustment in milliseconds: positive makes the notes come later. */
  setOffsetMs(offsetMs: number): void {
    this.offsetS = offsetMs / 1000;
  }

  play(): void {
    if (this.playing) return;
    this.rebase(this.rawNow());
    this.playing = true;
    this.player.play();
  }

  pause(): void {
    if (!this.playing) return;
    this.rebase(this.rawNow());
    this.playing = false;
    this.player.pause();
  }

  seek(songTimeS: number): void {
    const target = Math.max(0, songTimeS - this.offsetS);
    this.rebase(target);
    this.pendingSeekS = target;
    this.pendingSinceMs = this.options.wallMs();
    this.player.seekTo(target);
  }

  setRate(rate: number): void {
    if (rate <= 0) throw new RangeError('rate must be positive');
    this.rebase(this.rawNow());
    this.rate = rate;
    this.player.setPlaybackRate(rate);
  }

  /** Call regularly (for example every 250 ms) to correct drift against the player. */
  sync(): void {
    const reported = this.player.getCurrentTime();
    if (this.awaitingSeek(reported)) return;
    if (!this.playing) {
      this.anchorS = reported;
      return;
    }
    // A video that is loading (right after going back, say) does not move: neither do the notes.
    const buffering = this.player.isBuffering?.() ?? false;
    if (buffering || this.stalled) {
      this.stalled = buffering;
      this.rebase(reported);
      return;
    }
    const error = reported - this.rawNow();
    if (Math.abs(error) > this.snapThresholdS) this.rebase(reported);
    else this.rebase(this.rawNow() + error * this.gain);
  }

  /**
   * Right after a seek the player can still report the old position for a moment. Taking it
   * at face value would drag the clock back to where the song just left (a rewind would
   * undo itself), so reports are ignored until the player reaches the target or gives up.
   */
  private awaitingSeek(reported: number): boolean {
    const target = this.pendingSeekS;
    if (target === null) return false;
    const waitedMs = this.options.wallMs() - this.pendingSinceMs;
    if (Math.abs(reported - target) <= this.snapThresholdS || waitedMs > SEEK_PATIENCE_MS) {
      this.pendingSeekS = null;
      return false;
    }
    // Still loading the new place: the notes hold still there instead of running ahead.
    if (this.playing && (this.player.isBuffering?.() ?? false)) {
      this.stalled = true;
      this.rebase(target);
    }
    return true;
  }

  private rebase(timeS: number): void {
    this.anchorS = timeS;
    this.anchorWallMs = this.options.wallMs();
  }
}
