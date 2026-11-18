import type { ResultResponse } from '../../adapters/api/jobsApi';

export type LevelName = ResultResponse['levels'][number]['name'];

/** A song is "mastered" at this accuracy, at full speed and without wait mode (plan C8). */
export const MASTERED_ACCURACY = 0.9;
export const MASTERED_SPEED = 1;

export interface Attempt {
  readonly level: LevelName;
  /** Share of notes hit, 0 to 1. */
  readonly accuracy: number;
  /** Playback speed, 1 is the original tempo. */
  readonly speed: number;
  readonly waitMode: boolean;
}

export interface LevelProgress {
  readonly plays: number;
  readonly bestAccuracy: number;
  /** Fastest speed reached with at least the mastery accuracy. */
  readonly bestSpeed: number;
  readonly mastered: boolean;
}

export const EMPTY_PROGRESS: LevelProgress = {
  plays: 0,
  bestAccuracy: 0,
  bestSpeed: 0,
  mastered: false,
};

export interface LibrarySong {
  readonly id: string;
  readonly title: string;
  readonly savedAt: number;
  /** YouTube video id, when known; kept only in this browser. */
  readonly videoId?: string | null;
  /** The whole result, kept here because the server forgets it after delivery. */
  readonly result: ResultResponse;
  readonly progress: Partial<Record<LevelName, LevelProgress>>;
}

export interface SongLibrary {
  list(): Promise<LibrarySong[]>;
  get(id: string): Promise<LibrarySong | undefined>;
  put(song: LibrarySong): Promise<void>;
  remove(id: string): Promise<void>;
}

export function recordAttempt(song: LibrarySong, attempt: Attempt): LibrarySong {
  const before = song.progress[attempt.level] ?? EMPTY_PROGRESS;
  const accurate = attempt.accuracy >= MASTERED_ACCURACY;
  const next: LevelProgress = {
    plays: before.plays + 1,
    bestAccuracy: Math.max(before.bestAccuracy, attempt.accuracy),
    bestSpeed: accurate ? Math.max(before.bestSpeed, attempt.speed) : before.bestSpeed,
    mastered: before.mastered || (accurate && attempt.speed >= MASTERED_SPEED && !attempt.waitMode),
  };
  return { ...song, progress: { ...song.progress, [attempt.level]: next } };
}

const EXPORT_FORMAT = 'notacaida-library';
const EXPORT_VERSION = 1;

export function exportLibrary(songs: readonly LibrarySong[]): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, songs });
}

/** Throws `Error` with a stable message when the text is not a Notacaida export. */
export function parseLibrary(text: string): LibrarySong[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('invalid_export');
  }
  if (typeof data !== 'object' || data === null) throw new Error('invalid_export');
  const record = data as Record<string, unknown>;
  if (record['format'] !== EXPORT_FORMAT || record['version'] !== EXPORT_VERSION) {
    throw new Error('invalid_export');
  }
  const songs = record['songs'];
  if (!Array.isArray(songs) || !songs.every(isLibrarySong)) throw new Error('invalid_export');
  return songs;
}

export function isLibrarySong(value: unknown): value is LibrarySong {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const result = v['result'] as Record<string, unknown> | null | undefined;
  return (
    typeof v['id'] === 'string' &&
    typeof v['title'] === 'string' &&
    typeof v['savedAt'] === 'number' &&
    typeof v['progress'] === 'object' &&
    v['progress'] !== null &&
    typeof result === 'object' &&
    result !== null &&
    Array.isArray(result['levels'])
  );
}

/** Adds the songs of an export, keeping the copy with more plays when an id already exists. */
export async function importLibrary(library: SongLibrary, text: string): Promise<number> {
  const incoming = parseLibrary(text);
  const existing = new Map((await library.list()).map((s) => [s.id, s]));
  let added = 0;
  for (const song of incoming) {
    const current = existing.get(song.id);
    if (current && totalPlays(current) >= totalPlays(song)) continue;
    await library.put(song);
    added += 1;
  }
  return added;
}

function totalPlays(song: LibrarySong): number {
  return Object.values(song.progress).reduce((sum, p) => sum + p.plays, 0);
}
