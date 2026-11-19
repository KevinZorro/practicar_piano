import { DEFAULT_PREFS } from '../../core/practice/prefs';
import { createLocalPrefsStore, createMemoryPrefsStore } from './localPrefs';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('createLocalPrefsStore', () => {
  it('starts from the defaults and remembers what the player chose', () => {
    const storage = memoryStorage();
    expect(createLocalPrefsStore(storage).load()).toEqual(DEFAULT_PREFS);
    createLocalPrefsStore(storage).save({ ...DEFAULT_PREFS, view: 'sheet', naming: 'solfege' });
    expect(createLocalPrefsStore(storage).load()).toMatchObject({
      view: 'sheet',
      naming: 'solfege',
    });
  });

  it('ignores broken data and storage that refuses to work', () => {
    const storage = memoryStorage();
    storage.setItem('notacaida.prefs.v1', '{not json');
    expect(createLocalPrefsStore(storage).load()).toEqual(DEFAULT_PREFS);
    const refusing = memoryStorage();
    refusing.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(() => {
      createLocalPrefsStore(refusing).save(DEFAULT_PREFS);
    }).not.toThrow();
    expect(createLocalPrefsStore(null).load()).toEqual(DEFAULT_PREFS);
  });
});

describe('createMemoryPrefsStore', () => {
  it('keeps the last saved choice', () => {
    const store = createMemoryPrefsStore();
    store.save({ ...DEFAULT_PREFS, showVideo: false });
    expect(store.load().showVideo).toBe(false);
  });
});
