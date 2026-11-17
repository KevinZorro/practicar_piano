import { describe, expect, it, vi } from 'vitest';
import type { PlaybackClock } from '../clock/playbackClock';
import { MAX_SPEED, MIN_SPEED, normalizeSpeed, SpeedControl } from './speed';

function fakeClock() {
  const setRate = vi.fn<(rate: number) => void>();
  const clock: PlaybackClock = {
    now: () => 0,
    isPlaying: false,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setRate,
  };
  return { clock, setRate };
}

describe('normalizeSpeed', () => {
  it('keeps presets, clamps free values and rounds to hundredths', () => {
    expect(normalizeSpeed(0.75)).toBe(0.75);
    expect(normalizeSpeed(0.1)).toBe(MIN_SPEED);
    expect(normalizeSpeed(3)).toBe(MAX_SPEED);
    expect(normalizeSpeed(0.8333)).toBe(0.83);
    expect(normalizeSpeed(Number.NaN)).toBe(1);
  });
});

describe('SpeedControl', () => {
  it('applies the normalized speed to the clock', () => {
    const { clock, setRate } = fakeClock();
    const control = new SpeedControl(clock);
    expect(control.set(0.5)).toBe(0.5);
    expect(control.set(9)).toBe(MAX_SPEED);
    expect(setRate.mock.calls).toEqual([[0.5], [MAX_SPEED]]);
    expect(control.speed).toBe(MAX_SPEED);
  });
});
