import type { PlaybackClock } from '../clock/playbackClock';

export const SPEED_PRESETS = [0.5, 0.75, 1] as const;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 1.5;

/** Free speed is kept inside what YouTube plays without distortion. */
export function normalizeSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(speed * 100) / 100));
}

/** Applies the chosen speed to the clock (and through it to the video or the synth). */
export class SpeedControl {
  private current = 1;

  constructor(private readonly clock: PlaybackClock) {}

  get speed(): number {
    return this.current;
  }

  set(speed: number): number {
    this.current = normalizeSpeed(speed);
    this.clock.setRate(this.current);
    return this.current;
  }
}
