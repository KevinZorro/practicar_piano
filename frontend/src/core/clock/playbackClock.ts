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
  /** Silences the player (the microphone must not hear the video). Optional: the synth is silent anyway. */
  setMuted?(muted: boolean): void;
  /**
   * True while the player is loading data (after a seek, or a slow connection). The clock
   * holds still then, so the notes wait for the video instead of running ahead of it.
   */
  isBuffering?(): boolean;
  /**
   * Reports starts and stops the app did not ask for (the player clicked the video itself, or
   * it ended). Optional: only a real video can change on its own. Returns an unsubscribe.
   */
  onExternalChange?(listener: (playing: boolean) => void): () => void;
}
