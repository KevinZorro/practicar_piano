import type { PlayerPort } from './playbackClock';

/**
 * Starts on a stand-in (the synth counter) and moves to the real video once it is ready,
 * carrying over position, speed and whether it was playing. The clock never notices.
 */
export class SwitchablePlayer implements PlayerPort {
  private playing = false;
  private rate = 1;
  private muted = false;
  private readonly listeners = new Set<(playing: boolean) => void>();
  private unsubscribe: () => void;

  constructor(private current: PlayerPort) {
    this.unsubscribe = this.subscribe(current);
  }

  attach(next: PlayerPort): void {
    const timeS = this.current.getCurrentTime();
    this.unsubscribe();
    this.current.pause();
    this.current = next;
    this.unsubscribe = this.subscribe(next);
    next.setPlaybackRate(this.rate);
    next.setMuted?.(this.muted);
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
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.current.setMuted?.(muted);
  }

  /** Changes made on the current player itself (a click on the video), whichever it is. */
  onExternalChange(listener: (playing: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private subscribe(player: PlayerPort): () => void {
    return (
      player.onExternalChange?.((playing) => {
        this.playing = playing;
        for (const listener of this.listeners) listener(playing);
      }) ?? (() => undefined)
    );
  }
}
