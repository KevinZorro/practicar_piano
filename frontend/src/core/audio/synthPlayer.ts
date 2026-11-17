import type { PlayerPort } from '../clock/playbackClock';

/** Stand-in for the video when it cannot be embedded: it only counts time. */
export class SynthPlayer implements PlayerPort {
  private anchorS = 0;
  private anchorWallMs: number;
  private rate = 1;
  private playing = false;

  constructor(private readonly wallMs: () => number) {
    this.anchorWallMs = wallMs();
  }

  getCurrentTime(): number {
    if (!this.playing) return this.anchorS;
    return this.anchorS + ((this.wallMs() - this.anchorWallMs) / 1000) * this.rate;
  }

  private rebase(timeS: number): void {
    this.anchorS = timeS;
    this.anchorWallMs = this.wallMs();
  }

  play(): void {
    if (this.playing) return;
    this.rebase(this.anchorS);
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    this.rebase(this.getCurrentTime());
    this.playing = false;
  }

  seekTo(timeS: number): void {
    this.rebase(Math.max(0, timeS));
  }

  setPlaybackRate(rate: number): void {
    this.rebase(this.getCurrentTime());
    this.rate = rate;
  }
}
