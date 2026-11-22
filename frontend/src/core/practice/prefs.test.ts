import { DEFAULT_PREFS, parsePrefs, stepZoom } from './prefs';

describe('parsePrefs', () => {
  it('keeps valid stored choices', () => {
    const stored = {
      view: 'sheet',
      showVideo: false,
      audio: 'both',
      sheetColors: false,
      sheetLetters: true,
      naming: 'solfege',
      sheetZoom: 1.3,
      rewindS: 12,
      rewindOnSilence: false,
    };
    expect(parsePrefs(stored)).toEqual(stored);
  });

  it('falls back field by field on unknown or broken values', () => {
    expect(
      parsePrefs({
        view: 'piano-roll',
        naming: 3,
        sheetZoom: 7,
        showVideo: 'yes',
        audio: 'cd',
        rewindS: 99,
      }),
    ).toEqual(DEFAULT_PREFS);
    expect(parsePrefs({ rewindS: 2.5 }).rewindS).toBe(5);
    expect(parsePrefs({ rewindS: 0 }).rewindS).toBe(5);
    expect(parsePrefs({ view: 'falling' }).view).toBe('falling');
    expect(parsePrefs({ view: 'video' }).view).toBe('video');
    expect(parsePrefs({ audio: 'piano' }).audio).toBe('piano');
    expect(parsePrefs({}).audio).toBe('video');
  });

  it('returns the defaults for anything that is not an object', () => {
    expect(parsePrefs(null)).toBe(DEFAULT_PREFS);
    expect(parsePrefs('both')).toBe(DEFAULT_PREFS);
  });
});

describe('stepZoom', () => {
  it('moves one size up or down and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.15);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(1.5, 1)).toBe(1.5);
    expect(stepZoom(0.8, -1)).toBe(0.8);
  });
});
