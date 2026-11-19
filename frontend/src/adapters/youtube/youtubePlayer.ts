import type { PlayerPort } from '../../core/clock/playbackClock';

/** The subset of `YT.Player` we use. */
export interface YtPlayerLike {
  getCurrentTime(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  mute?(): void;
  unMute?(): void;
}

/** `YT.PlayerState` values the port reacts to. */
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;

export class YouTubePlayerPort implements PlayerPort {
  /** What the app last asked for, to tell its own changes from the player's clicks. */
  private commanded: 'play' | 'pause' = 'pause';
  private readonly listeners = new Set<(playing: boolean) => void>();
  private buffering = false;

  constructor(private readonly player: YtPlayerLike) {}

  getCurrentTime(): number {
    return this.player.getCurrentTime();
  }
  play(): void {
    this.commanded = 'play';
    this.player.playVideo();
  }
  pause(): void {
    this.commanded = 'pause';
    this.player.pauseVideo();
  }
  seekTo(timeS: number): void {
    this.player.seekTo(timeS, true);
  }
  setPlaybackRate(rate: number): void {
    this.player.setPlaybackRate(rate);
  }
  isBuffering(): boolean {
    return this.buffering;
  }
  setMuted(muted: boolean): void {
    if (muted) this.player.mute?.();
    else this.player.unMute?.();
  }

  onExternalChange(listener: (playing: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Feed `onStateChange` here. A click on the video starts or stops it without the app
   * knowing; the app then follows instead of drawing a song that runs on its own.
   */
  handleState(state: number): void {
    this.buffering = state === YT_BUFFERING;
    if (state !== YT_PLAYING && state !== YT_PAUSED && state !== YT_ENDED) return;
    const playing = state === YT_PLAYING;
    if (playing === (this.commanded === 'play')) return;
    for (const listener of this.listeners) listener(playing);
  }
}

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

interface YtWindow {
  onYouTubeIframeAPIReady?: () => void;
}

let apiPromise: Promise<void> | null = null;

/** Loads the official IFrame API once. Resolves when `YT.Player` can be created. */
export function loadYouTubeIframeApi(doc: Document = document): Promise<void> {
  apiPromise ??= new Promise<void>((resolve, reject) => {
    const win = doc.defaultView as (Window & YtWindow) | null;
    if (!win) {
      reject(new Error('No window available'));
      return;
    }
    win.onYouTubeIframeAPIReady = resolve;
    const script = doc.createElement('script');
    script.src = IFRAME_API_SRC;
    script.async = true;
    script.onerror = () => {
      apiPromise = null; // allow a retry, e.g. when the video cannot be embedded or offline
      reject(new Error('The YouTube player could not be loaded'));
    };
    doc.head.appendChild(script);
  });
  return apiPromise;
}

/** Test helper: forget the cached load. */
export function resetYouTubeApiForTests(): void {
  apiPromise = null;
}
