import { InterpolatedClock } from './interpolatedClock';
import type { PlayerPort } from './playbackClock';

class FakePlayer implements PlayerPort {
  time = 0;
  calls: string[] = [];
  getCurrentTime(): number {
    return this.time;
  }
  play(): void {
    this.calls.push('play');
  }
  pause(): void {
    this.calls.push('pause');
  }
  seekTo(timeS: number): void {
    this.time = timeS;
    this.calls.push(`seek:${String(timeS)}`);
  }
  setPlaybackRate(rate: number): void {
    this.calls.push(`rate:${String(rate)}`);
  }
}

function setup() {
  let wall = 1000;
  const player = new FakePlayer();
  const clock = new InterpolatedClock(player, { wallMs: () => wall });
  return {
    player,
    clock,
    advance: (ms: number) => {
      wall += ms;
    },
  };
}

describe('InterpolatedClock', () => {
  it('stays put while paused', () => {
    const { clock, advance } = setup();
    advance(5000);
    expect(clock.now()).toBe(0);
  });

  it('advances with the wall clock between player reports', () => {
    const { clock, advance } = setup();
    clock.play();
    advance(1500);
    expect(clock.now()).toBeCloseTo(1.5);
  });

  it('scales time with the playback rate', () => {
    const { clock, advance, player } = setup();
    clock.play();
    advance(1000);
    clock.setRate(0.5);
    advance(2000);
    expect(clock.now()).toBeCloseTo(2); // 1 s at full speed + 2 s at half speed
    expect(player.calls).toContain('rate:0.5');
  });

  it('rejects non-positive rates', () => {
    expect(() => {
      setup().clock.setRate(0);
    }).toThrow(RangeError);
  });

  it('freezes at the right position on pause and resumes from it', () => {
    const { clock, advance, player } = setup();
    clock.play();
    advance(2000);
    clock.pause();
    advance(10_000);
    expect(clock.now()).toBeCloseTo(2);
    clock.play();
    advance(500);
    expect(clock.now()).toBeCloseTo(2.5);
    expect(player.calls).toEqual(['play', 'pause', 'play']);
  });

  it('play and pause are idempotent', () => {
    const { clock, player } = setup();
    clock.play();
    clock.play();
    clock.pause();
    clock.pause();
    expect(player.calls).toEqual(['play', 'pause']);
  });

  it('seek moves the clock and the player, never below zero', () => {
    const { clock, player } = setup();
    clock.seek(42);
    expect(clock.now()).toBe(42);
    clock.seek(-3);
    expect(clock.now()).toBe(0);
    expect(player.calls).toEqual(['seek:42', 'seek:0']);
  });

  it('smooths small drift instead of jumping', () => {
    const { clock, advance, player } = setup();
    clock.play();
    advance(1000);
    player.time = 1.1; // player is 100 ms ahead of our estimate
    const before = clock.now();
    clock.sync();
    const after = clock.now();
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThan(0.1); // moved toward it, not all the way
    expect(after - before).toBeCloseTo(0.025);
  });

  it('converges on the player over repeated syncs', () => {
    const { clock, advance, player } = setup();
    clock.play();
    player.time = 0.2;
    for (let i = 0; i < 30; i++) {
      advance(250);
      player.time += 0.25; // the player really is 0.2 s ahead of the wall clock
      clock.sync();
    }
    expect(Math.abs(clock.now() - player.time)).toBeLessThan(0.01);
  });

  it('snaps on large errors such as a seek made inside the player', () => {
    const { clock, advance, player } = setup();
    clock.play();
    advance(1000);
    player.time = 30;
    clock.sync();
    expect(clock.now()).toBeCloseTo(30);
  });

  it('follows the player while paused', () => {
    const { clock, player } = setup();
    player.time = 12;
    clock.sync();
    expect(clock.now()).toBe(12);
  });

  it('applies the sync offset to now() and compensates it on seek', () => {
    const { clock, advance, player } = setup();
    clock.setOffsetMs(-120);
    clock.play();
    advance(1000);
    expect(clock.now()).toBeCloseTo(0.88);
    clock.seek(10);
    expect(clock.now()).toBeCloseTo(10);
    expect(player.time).toBeCloseTo(10.12);
  });
});
