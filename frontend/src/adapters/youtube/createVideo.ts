import type { PlayerPort } from '../../core/clock/playbackClock';
import { YouTubePlayerPort, loadYouTubeIframeApi, type YtPlayerLike } from './youtubePlayer';

interface YtApi {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, number>;
      events: {
        onReady: () => void;
        onError: () => void;
        onStateChange: (event: { data: number }) => void;
      };
    },
  ) => YtPlayerLike;
}

/**
 * Embeds the video with the official IFrame API and resolves once it can be controlled.
 * Rejects when the API cannot load or the video cannot be embedded; the caller keeps the
 * synth stand-in then.
 */
export async function createYouTubeVideo(host: HTMLElement, videoId: string): Promise<PlayerPort> {
  await loadYouTubeIframeApi();
  const api = (window as unknown as { YT?: YtApi }).YT;
  if (!api) throw new Error('The YouTube player is not available');
  const target = host.ownerDocument.createElement('div');
  host.appendChild(target);
  return new Promise<PlayerPort>((resolve, reject) => {
    let port: YouTubePlayerPort | null = null;
    const player = new api.Player(target, {
      videoId,
      width: '100%',
      height: '100%',
      // No related videos at the end; keyboard focus stays with the practice screen.
      playerVars: { rel: 0, playsinline: 1, disablekb: 1, controls: 0 },
      events: {
        onReady: () => {
          port = new YouTubePlayerPort(player);
          resolve(port);
        },
        onError: () => {
          reject(new Error('The video cannot be played here'));
        },
        onStateChange: (event) => {
          port?.handleState(event.data);
        },
      },
    });
  });
}
