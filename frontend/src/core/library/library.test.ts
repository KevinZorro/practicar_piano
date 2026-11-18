import { describe, expect, it } from 'vitest';
import {
  exportLibrary,
  importLibrary,
  parseLibrary,
  recordAttempt,
  type LibrarySong,
  type SongLibrary,
} from './library';

const song = (id = 's1'): LibrarySong => ({
  id,
  title: 'Song',
  savedAt: 1,
  result: { meta: { duration_s: 10, tempo_bpm: 120, tempo_confidence: 'high' }, levels: [] },
  progress: {},
});

class MemoryLibrary implements SongLibrary {
  readonly items = new Map<string, LibrarySong>();
  list() {
    return Promise.resolve([...this.items.values()]);
  }
  get(id: string) {
    return Promise.resolve(this.items.get(id));
  }
  put(s: LibrarySong) {
    this.items.set(s.id, s);
    return Promise.resolve();
  }
  remove(id: string) {
    this.items.delete(id);
    return Promise.resolve();
  }
}

describe('recordAttempt', () => {
  it('keeps the best accuracy and counts plays', () => {
    let s = recordAttempt(song(), { level: 'easy', accuracy: 0.7, speed: 0.5, waitMode: true });
    s = recordAttempt(s, { level: 'easy', accuracy: 0.5, speed: 0.5, waitMode: true });
    expect(s.progress.easy).toMatchObject({ plays: 2, bestAccuracy: 0.7, mastered: false });
  });

  it('counts speed only from accurate runs', () => {
    let s = recordAttempt(song(), { level: 'easy', accuracy: 0.6, speed: 1, waitMode: false });
    expect(s.progress.easy?.bestSpeed).toBe(0);
    s = recordAttempt(s, { level: 'easy', accuracy: 0.92, speed: 0.75, waitMode: false });
    expect(s.progress.easy?.bestSpeed).toBe(0.75);
  });

  it('masters at 90% accuracy, full speed and no wait mode, and stays mastered', () => {
    const base = { level: 'playable', accuracy: 0.9, speed: 1 } as const;
    expect(recordAttempt(song(), { ...base, waitMode: true }).progress.playable?.mastered).toBe(
      false,
    );
    expect(
      recordAttempt(song(), { ...base, speed: 0.9, waitMode: false }).progress.playable?.mastered,
    ).toBe(false);
    const mastered = recordAttempt(song(), { ...base, waitMode: false });
    expect(mastered.progress.playable?.mastered).toBe(true);
    const later = recordAttempt(mastered, { ...base, accuracy: 0.3, waitMode: true });
    expect(later.progress.playable?.mastered).toBe(true);
  });

  it('keeps levels apart and does not mutate the input', () => {
    const original = song();
    const next = recordAttempt(original, { level: 'easy', accuracy: 1, speed: 1, waitMode: false });
    expect(original.progress).toEqual({});
    expect(next.progress.playable).toBeUndefined();
  });
});

describe('export and import', () => {
  it('round-trips a library', () => {
    expect(parseLibrary(exportLibrary([song('a'), song('b')]))).toEqual([song('a'), song('b')]);
  });

  it.each(['not json', '{}', '{"format":"other","version":1,"songs":[]}', 'null'])(
    'rejects %s',
    (text) => {
      expect(() => parseLibrary(text)).toThrow('invalid_export');
    },
  );

  it('rejects songs with a wrong shape', () => {
    const text = JSON.stringify({ format: 'teclario-library', version: 1, songs: [{ id: 1 }] });
    expect(() => parseLibrary(text)).toThrow('invalid_export');
  });

  it('adds new songs and keeps the copy with more plays', async () => {
    const library = new MemoryLibrary();
    const played = recordAttempt(song('a'), {
      level: 'easy',
      accuracy: 1,
      speed: 1,
      waitMode: false,
    });
    await library.put(played);
    const added = await importLibrary(library, exportLibrary([song('a'), song('b')]));
    expect(added).toBe(1);
    expect(library.items.get('a')).toEqual(played);
    expect(library.items.has('b')).toBe(true);
  });
});
