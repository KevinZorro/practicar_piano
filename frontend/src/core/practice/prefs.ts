/** How the player reads the song: falling notes, the score, or both at once. */
export type PracticeView = 'falling' | 'sheet' | 'both';
/** Note names as letters (C D E) or as solfège (Do Re Mi). */
export type NamingStyle = 'letters' | 'solfege';

/** Choices that belong to the player, not to a song: they are kept between songs and visits. */
export interface PracticePrefs {
  readonly view: PracticeView;
  /** Shows the YouTube video when the song has one; hidden, the app's piano plays instead. */
  readonly showVideo: boolean;
  /** Colours the noteheads like the falling notes and the keys. */
  readonly sheetColors: boolean;
  /** Writes the name of every note under the staff. */
  readonly sheetLetters: boolean;
  readonly naming: NamingStyle;
  /** Size of the score, 1 is the renderer's default. */
  readonly sheetZoom: number;
}

export const SHEET_ZOOM_STEPS = [0.8, 0.9, 1, 1.15, 1.3, 1.5] as const;

export const DEFAULT_PREFS: PracticePrefs = {
  view: 'both',
  showVideo: true,
  sheetColors: true,
  sheetLetters: true,
  naming: 'letters',
  sheetZoom: 1,
};

const VIEWS: readonly PracticeView[] = ['falling', 'sheet', 'both'];
const NAMINGS: readonly NamingStyle[] = ['letters', 'solfege'];

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Reads stored preferences field by field: anything unknown or broken takes its default. */
export function parsePrefs(value: unknown): PracticePrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const v = value as Record<string, unknown>;
  return {
    view: pick(v['view'], VIEWS, DEFAULT_PREFS.view),
    showVideo: flag(v['showVideo'], DEFAULT_PREFS.showVideo),
    sheetColors: flag(v['sheetColors'], DEFAULT_PREFS.sheetColors),
    sheetLetters: flag(v['sheetLetters'], DEFAULT_PREFS.sheetLetters),
    naming: pick(v['naming'], NAMINGS, DEFAULT_PREFS.naming),
    sheetZoom: pick(v['sheetZoom'], SHEET_ZOOM_STEPS, DEFAULT_PREFS.sheetZoom),
  };
}

/** The next score size up or down, staying inside the steps. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const index = SHEET_ZOOM_STEPS.findIndex((z) => z >= current);
  const from = index < 0 ? SHEET_ZOOM_STEPS.length - 1 : index;
  const next = Math.min(Math.max(from + direction, 0), SHEET_ZOOM_STEPS.length - 1);
  return SHEET_ZOOM_STEPS[next] ?? current;
}
