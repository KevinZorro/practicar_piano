import { describe, expect, it } from 'vitest';
import type { ResultResponse } from '../../adapters/api/jobsApi';
import { availableLevels, viewLevel } from './level';

const level = (name: 'original' | 'playable' | 'easy', pitches: number[]) => ({
  name,
  notes: pitches.map((pitch, i) => ({ pitch, start_s: i, end_s: i + 0.5, velocity: 0 })),
  notes_dropped_ratio: name === 'easy' ? 0.5 : 0,
  max_polyphony_before: 12,
  max_polyphony_after: 8,
  score: name === 'original' ? null : { musicxml: '<x/>', tempo_bpm: 120, measures: [] },
});

const result: ResultResponse = {
  meta: { duration_s: 10, tempo_bpm: 120, tempo_confidence: 'high' },
  levels: [level('original', [40, 60, 72, 80]), level('playable', [40, 72]), level('easy', [72])],
};

describe('viewLevel', () => {
  it('converts notes with ids, hands by middle C and a velocity of at least 1', () => {
    const view = viewLevel(result, 'playable');
    expect(view.notes).toEqual([
      { id: 0, pitch: 40, startS: 0, endS: 0.5, velocity: 1, hand: 'left' },
      { id: 1, pitch: 72, startS: 1, endS: 1.5, velocity: 1, hand: 'right' },
    ]);
    expect(view.score?.musicxml).toBe('<x/>');
  });
  it('reports how much the easy level simplified', () => {
    expect(viewLevel(result, 'easy').droppedRatio).toBe(0.5);
  });
  it('falls back to playable when the level is missing, and copes with no levels', () => {
    const noEasy = { ...result, levels: result.levels.slice(0, 2) };
    expect(viewLevel(noEasy, 'easy').name).toBe('playable');
    expect(viewLevel({ ...result, levels: [] }, 'easy').notes).toEqual([]);
  });
});

describe('availableLevels', () => {
  it('offers playable and easy but never the original', () => {
    expect(availableLevels(result)).toEqual(['playable', 'easy']);
    expect(availableLevels({ ...result, levels: result.levels.slice(0, 1) })).toEqual([]);
  });
});
