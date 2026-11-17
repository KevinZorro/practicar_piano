import type { PlayerPort } from './playbackClock';

/**
 * Starts on a stand-in (the synth counter) and moves to the real video once it is ready,
 * carrying over position, speed and whether it was playing. The clock never notices.
 */
export class SwitchablePlayer implements PlayerPort {
  private playing = false;
  private rate = 1;

  constructor(private current: PlayerPort) {}

  attach(next: PlayerPort): void {
    const timeS = this.current.getCurrentTime();
    this.current.pause();
    this.current = next;
    next.setPlaybackRate(this.rate);
    next.seekTo(timeS);
    if (this.playing) next.play();
  }

  getCurrentTime(): number {
    return this.current.getCurrentTime();
  }
  play(): void {
    this.playing = true;
    this.current.play();
  }
  pause(): void {
    this.playing = false;
    this.current.pause();
  }
  seekTo(timeS: number): void {
    this.current.seekTo(timeS);
  }
  setPlaybackRate(rate: number): void {
    this.rate = rate;
    this.current.setPlaybackRate(rate);
  }
}
