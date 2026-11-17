import type { PlayerPort } from '../../core/clock/playbackClock';

/** The subset of `YT.Player` we use. */
export interface YtPlayerLike {
  getCurrentTime(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
}

export class YouTubePlayerPort implements PlayerPort {
  constructor(private readonly player: YtPlayerLike) {}

  getCurrentTime(): number {
    return this.player.getCurrentTime();
  }
  play(): void {
    this.player.playVideo();
  }
  pause(): void {
    this.player.pauseVideo();
  }
  seekTo(timeS: number): void {
    this.player.seekTo(timeS, true);
  }
  setPlaybackRate(rate: number): void {
    this.player.setPlaybackRate(rate);
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
