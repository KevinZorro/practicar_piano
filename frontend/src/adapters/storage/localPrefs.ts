import { DEFAULT_PREFS, parsePrefs, type PracticePrefs } from '../../core/practice/prefs';

/** Keeps the player's reading choices between visits. */
export interface PrefsStore {
  load(): PracticePrefs;
  save(prefs: PracticePrefs): void;
}

const KEY = 'notacaida.prefs.v1';

/**
 * Preferences in `localStorage`. Storage can be missing or refuse writes (private windows, full
 * disk): then the choices simply last until the page is closed.
 */
export function createLocalPrefsStore(storage: Storage | null): PrefsStore {
  return {
    load() {
      try {
        const raw = storage?.getItem(KEY);
        return raw ? parsePrefs(JSON.parse(raw)) : DEFAULT_PREFS;
      } catch {
        return DEFAULT_PREFS;
      }
    },
    save(prefs) {
      try {
        storage?.setItem(KEY, JSON.stringify(prefs));
      } catch {
        // Not saved: the choice still applies to this visit.
      }
    },
  };
}

/** The page's `localStorage`, or null where reading it throws (blocked site data). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** For tests and for browsers without storage: remembers only while the page is open. */
export function createMemoryPrefsStore(initial: PracticePrefs = DEFAULT_PREFS): PrefsStore {
  let current = initial;
  return {
    load: () => current,
    save(prefs) {
      current = prefs;
    },
  };
}
