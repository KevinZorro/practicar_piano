/**
 * The single source of time for the canvas, the score cursor and wait mode.
 * Times are song seconds at 100 % speed, shifted by the user's sync offset.
 */
export interface PlaybackClock {
  now(): number;
  readonly isPlaying: boolean;
  play(): void;
  pause(): void;
  seek(songTimeS: number): void;
  setRate(rate: number): void;
}

/** What a media player (YouTube or a synth) offers; both implement this. */
export interface PlayerPort {
  /** Position in seconds as last reported by the player (coarse: a few updates per second). */
  getCurrentTime(): number;
  play(): void;
  pause(): void;
  seekTo(timeS: number): void;
  setPlaybackRate(rate: number): void;
}
