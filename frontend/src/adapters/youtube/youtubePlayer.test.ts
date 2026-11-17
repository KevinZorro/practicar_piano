import {
  YouTubePlayerPort,
  loadYouTubeIframeApi,
  resetYouTubeApiForTests,
  type YtPlayerLike,
} from './youtubePlayer';

describe('YouTubePlayerPort', () => {
  it('maps the port onto the YT.Player methods', () => {
    const calls: string[] = [];
    const yt: YtPlayerLike = {
      getCurrentTime: () => 12.5,
      playVideo: () => calls.push('play'),
      pauseVideo: () => calls.push('pause'),
      seekTo: (s, ahead) => calls.push(`seek:${String(s)}:${String(ahead)}`),
      setPlaybackRate: (r) => calls.push(`rate:${String(r)}`),
    };
    const port = new YouTubePlayerPort(yt);
    port.play();
    port.pause();
    port.seekTo(3);
    port.setPlaybackRate(0.75);
    expect(port.getCurrentTime()).toBe(12.5);
    expect(calls).toEqual(['play', 'pause', 'seek:3:true', 'rate:0.75']);
  });
});

describe('loadYouTubeIframeApi', () => {
  beforeEach(() => {
    resetYouTubeApiForTests();
    document.head.innerHTML = '';
  });

  it('injects the official script once and resolves when the API is ready', async () => {
    const first = loadYouTubeIframeApi();
    const second = loadYouTubeIframeApi();
    expect(second).toBe(first);
    const scripts = document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.src).toBe('https://www.youtube.com/iframe_api');
    (window as unknown as { onYouTubeIframeAPIReady: () => void }).onYouTubeIframeAPIReady();
    await expect(first).resolves.toBeUndefined();
  });

  it('rejects, and allows a retry, when the script fails to load', async () => {
    const attempt = loadYouTubeIframeApi();
    document.head.querySelector('script')?.dispatchEvent(new Event('error'));
    await expect(attempt).rejects.toThrow('could not be loaded');
    expect(loadYouTubeIframeApi()).not.toBe(attempt);
  });
});
