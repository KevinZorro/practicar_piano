import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { LibrarySong } from '../../core/library/library';
import { DB_VERSION, IndexedDbLibrary, openLibraryDb } from './indexedDbLibrary';

const song = (id: string, savedAt: number): LibrarySong => ({
  id,
  title: id,
  savedAt,
  result: { meta: { duration_s: 10, tempo_bpm: 120, tempo_confidence: 'high' }, levels: [] },
  progress: {},
});

async function library(factory = new IDBFactory()) {
  return new IndexedDbLibrary(await openLibraryDb(factory));
}

describe('IndexedDbLibrary', () => {
  it('saves, reads, lists newest first and removes', async () => {
    const lib = await library();
    await lib.put(song('old', 1));
    await lib.put(song('new', 2));
    expect((await lib.list()).map((s) => s.id)).toEqual(['new', 'old']);
    expect(await lib.get('old')).toEqual(song('old', 1));
    await lib.remove('old');
    expect(await lib.get('old')).toBeUndefined();
  });

  it('overwrites a song with the same id', async () => {
    const lib = await library();
    await lib.put(song('a', 1));
    await lib.put({ ...song('a', 1), title: 'renamed' });
    expect((await lib.list()).map((s) => s.title)).toEqual(['renamed']);
  });

  it('ignores records that are not songs', async () => {
    const factory = new IDBFactory();
    const db = await openLibraryDb(factory);
    const tx = db.transaction('songs', 'readwrite');
    tx.objectStore('songs').put({ id: 'broken' });
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
    expect(await new IndexedDbLibrary(db).list()).toEqual([]);
  });

  it('migrates a version 1 database, keeping its songs and adding progress', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const open = factory.open('pianola', 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('songs', { keyPath: 'id' });
      };
      open.onsuccess = () => {
        const withoutProgress = {
          id: 'legacy',
          title: 'legacy',
          savedAt: 5,
          result: song('x', 0).result,
        };
        const tx = open.result.transaction('songs', 'readwrite');
        tx.objectStore('songs').put(withoutProgress);
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error('seed failed'));
        };
      };
    });
    const db = await openLibraryDb(factory);
    expect(db.version).toBe(DB_VERSION);
    const migrated = await new IndexedDbLibrary(db).get('legacy');
    expect(migrated?.progress).toEqual({});
    expect(migrated?.savedAt).toBe(5);
  });
});
