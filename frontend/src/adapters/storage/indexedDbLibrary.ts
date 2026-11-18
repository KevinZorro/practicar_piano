import { isLibrarySong, type LibrarySong, type SongLibrary } from '../../core/library/library';

export const DB_NAME = 'notacaida';
export const DB_VERSION = 2;
const STORE = 'songs';

/** One step per schema version, applied in order when a browser holds an older database. */
const MIGRATIONS: readonly ((db: IDBDatabase, tx: IDBTransaction) => void)[] = [
  // v1: songs keyed by id
  (db) => {
    db.createObjectStore(STORE, { keyPath: 'id' });
  },
  // v2: progress per level and a savedAt index; v1 records get an empty progress
  (_db, tx) => {
    const store = tx.objectStore(STORE);
    store.createIndex('savedAt', 'savedAt');
    store.openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) return;
      const song = cursor.value as Record<string, unknown>;
      if (song['progress'] === undefined) cursor.update({ ...song, progress: {} });
      cursor.continue();
    };
  },
];

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('indexeddb_error'));
    };
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error('indexeddb_error'));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error('indexeddb_aborted'));
    };
  });
}

export function openLibraryDb(factory: IDBFactory, name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const tx = request.transaction;
      if (!tx) return;
      for (let v = event.oldVersion; v < DB_VERSION; v += 1) MIGRATIONS[v]?.(request.result, tx);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('indexeddb_error'));
    };
  });
}

/** Songs saved in the browser: the only copy once the server has delivered and forgotten. */
export class IndexedDbLibrary implements SongLibrary {
  constructor(private readonly db: IDBDatabase) {}

  async list(): Promise<LibrarySong[]> {
    const rows = await done(this.db.transaction(STORE).objectStore(STORE).getAll());
    return rows.filter(isLibrarySong).sort((a, b) => b.savedAt - a.savedAt);
  }

  async get(id: string): Promise<LibrarySong | undefined> {
    const row: unknown = await done(this.db.transaction(STORE).objectStore(STORE).get(id));
    return isLibrarySong(row) ? row : undefined;
  }

  async put(song: LibrarySong): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(song);
    await finished(tx);
  }

  async remove(id: string): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await finished(tx);
  }
}
