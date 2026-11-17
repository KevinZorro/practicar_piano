import type { ResultResponse } from '../../adapters/api/jobsApi';
import { assignHand } from './hands';
import type { Note } from '../notes/model';

export type Level = ResultResponse['levels'][number];
export type LevelName = Level['name'];

/** The levels a player can choose; the original is kept only for reference. */
export const PLAYABLE_LEVELS: readonly LevelName[] = ['playable', 'easy'];

export interface LevelView {
  readonly name: LevelName;
  readonly notes: readonly Note[];
  readonly score: Level['score'];
  readonly droppedRatio: number;
}

/** The notes and score of a level; an unknown name falls back to `playable`. */
export function viewLevel(result: ResultResponse, name: LevelName): LevelView {
  const level =
    result.levels.find((l) => l.name === name) ??
    result.levels.find((l) => l.name === 'playable') ??
    result.levels[0];
  if (!level) return { name, notes: [], score: null, droppedRatio: 0 };
  return {
    name: level.name,
    notes: level.notes.map((n, id) => ({
      id,
      pitch: n.pitch,
      startS: n.start_s,
      endS: n.end_s,
      velocity: Math.max(1, n.velocity),
      hand: assignHand(n.pitch),
    })),
    score: level.score ?? null,
    droppedRatio: level.notes_dropped_ratio,
  };
}

export function availableLevels(result: ResultResponse): LevelName[] {
  return PLAYABLE_LEVELS.filter((name) => result.levels.some((l) => l.name === name));
}
