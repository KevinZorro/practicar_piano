import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../../core/notes/model';

const mocks = vi.hoisted(() => {
  const sampler = { triggerAttackRelease: vi.fn(), releaseAll: vi.fn(), toDestination: vi.fn() };
  const fm = { triggerAttackRelease: vi.fn(), releaseAll: vi.fn(), toDestination: vi.fn() };
  const state: { options: { onload?: () => void; onerror?: () => void } | null } = {
    options: null,
  };
  return { sampler, fm, state };
});

vi.mock('tone', () => ({
  start: vi.fn(() => Promise.resolve()),
  Frequency: (pitch: number) => ({
    toNote: () => `note${String(pitch)}`,
    toFrequency: () => 440 + pitch,
  }),
  Sampler: vi.fn(function (options: { onload?: () => void; onerror?: () => void }) {
    mocks.state.options = options;
    mocks.sampler.toDestination.mockReturnValue(mocks.sampler);
    return mocks.sampler;
  }),
  PolySynth: vi.fn(function () {
    mocks.fm.toDestination.mockReturnValue(mocks.fm);
    return mocks.fm;
  }),
  FMSynth: function () {},
}));

import { pianoSampleUrls } from './pianoSamples';
import { TonePiano } from './tonePiano';

const note: Note = { id: 1, pitch: 60, startS: 0, endS: 1, velocity: 100, hand: 'right' };

describe('TonePiano', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a stand-in voice until the samples have loaded', () => {
    const piano = new TonePiano();
    piano.preload();
    piano.play(note, 1);
    expect(mocks.fm.triggerAttackRelease).toHaveBeenCalledTimes(1);
    expect(mocks.sampler.triggerAttackRelease).not.toHaveBeenCalled();

    mocks.state.options?.onload?.();
    piano.play(note, 1);
    expect(mocks.sampler.triggerAttackRelease).toHaveBeenCalledWith(
      'note60',
      1,
      undefined,
      100 / 127,
    );
    expect(mocks.fm.triggerAttackRelease).toHaveBeenCalledTimes(1);
  });

  it('keeps the stand-in voice when the samples fail', () => {
    const piano = new TonePiano();
    piano.preload();
    mocks.state.options?.onerror?.();
    piano.play(note, 0.01);
    expect(mocks.fm.triggerAttackRelease).toHaveBeenCalledWith(500, 0.05, undefined, 100 / 127);
  });

  it('creates the sampler once however often it is preloaded or unlocked', async () => {
    const piano = new TonePiano();
    piano.preload();
    await piano.unlock();
    piano.preload();
    expect(mocks.sampler.toDestination).toHaveBeenCalledTimes(1);
  });

  it('releases every voice on stopAll', () => {
    const piano = new TonePiano();
    piano.preload();
    piano.play(note, 1);
    piano.stopAll();
    expect(mocks.sampler.releaseAll).toHaveBeenCalled();
    expect(mocks.fm.releaseAll).toHaveBeenCalled();
  });
});

describe('piano samples', () => {
  const dir = resolve(__dirname, '../../../public/samples/piano');

  it('covers A0 to C8 every minor third and every file is shipped', () => {
    const urls = pianoSampleUrls();
    expect(Object.keys(urls)).toHaveLength(30);
    for (const file of Object.values(urls)) expect(existsSync(resolve(dir, file))).toBe(true);
  });

  it('credits the recordings (CC BY 3.0 asks for it)', () => {
    const credits = readFileSync(resolve(dir, 'LICENSE.md'), 'utf8');
    expect(credits).toContain('Alexander Holm');
    expect(credits).toContain('CC BY 3.0');
  });
});
