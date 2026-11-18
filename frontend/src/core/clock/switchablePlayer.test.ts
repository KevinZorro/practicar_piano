import type { PlayerPort } from './playbackClock';
import { SwitchablePlayer } from './switchablePlayer';

class FakePlayer implements PlayerPort {
  listener: ((playing: boolean) => void) | null = null;
  played = 0;
  paused = 0;
  rate = 1;
  constructor(public time = 0) {}
  getCurrentTime = () => this.time;
  play = () => {
    this.played++;
  };
  pause = () => {
    this.paused++;
  };
  seekTo = (t: number) => {
    this.time = t;
  };
  setPlaybackRate = (r: number) => {
    this.rate = r;
  };
  onExternalChange = (listener: (playing: boolean) => void) => {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  };
}

describe('SwitchablePlayer', () => {
  it('carries position, speed and playing state over to the video', () => {
    const stand = new FakePlayer(12.5);
    const video = new FakePlayer();
    const player = new SwitchablePlayer(stand);
    player.setPlaybackRate(0.75);
    player.play();
    player.attach(video);
    expect(stand.paused).toBe(1);
    expect(video.time).toBe(12.5);
    expect(video.rate).toBe(0.75);
    expect(video.played).toBe(1);
    expect(player.getCurrentTime()).toBe(12.5);
  });

  it('does not start the video when it was paused', () => {
    const video = new FakePlayer();
    const player = new SwitchablePlayer(new FakePlayer(3));
    player.attach(video);
    expect(video.played).toBe(0);
    expect(video.time).toBe(3);
  });

  it('passes on clicks made on the current player and forgets the previous one', () => {
    const stand = new FakePlayer();
    const video = new FakePlayer();
    const player = new SwitchablePlayer(stand);
    const seen: boolean[] = [];
    player.onExternalChange((playing) => seen.push(playing));
    player.attach(video);
    expect(stand.listener).toBeNull();
    video.listener?.(true);
    expect(seen).toEqual([true]);
    // The new state is carried over when switching back to the stand-in.
    player.attach(stand);
    expect(stand.played).toBe(1);
  });
});
