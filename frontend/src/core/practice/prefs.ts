/**
 * How the player reads the song: falling notes, the score, both at once, or the YouTube video
 * itself in place of the falling notes (its own falling notes are usually the original ones).
 */
export type PracticeView = 'falling' | 'sheet' | 'both' | 'video';
/**
 * What is heard while practising a song that has a video: the video's own sound, the app's
 * piano playing the song's notes (the video stays paused), or both at once.
 */
export type AudioSource = 'video' | 'piano' | 'both';
/** Note names as letters (C D E) or as solfège (Do Re Mi). */
export type NamingStyle = 'letters' | 'solfege';

/** Choices that belong to the player, not to a song: they are kept between songs and visits. */
export interface PracticePrefs {
  readonly view: PracticeView;
  /** Shows the YouTube video when the song has one; hidden, the app's piano plays instead. */
  readonly showVideo: boolean;
  /** What is heard; it applies while the video is shown, hidden the app's piano plays. */
  readonly audio: AudioSource;
  /** Colours the noteheads like the falling notes and the keys. */
  readonly sheetColors: boolean;
  /** Writes the name of every note under the staff. */
  readonly sheetLetters: boolean;
  readonly naming: NamingStyle;
  /** Size of the score, 1 is the renderer's default. */
  readonly sheetZoom: number;
  /** Seconds the song goes back after a wrong key (wait mode and follow mode). */
  readonly rewindS: number;
  /** Follow mode: a skipped chord also rewinds, not only a wrong key. */
  readonly rewindOnMiss: boolean;
}

export const REWIND_MIN_S = 1;
export const REWIND_MAX_S = 30;

export const SHEET_ZOOM_STEPS = [0.8, 0.9, 1, 1.15, 1.3, 1.5] as const;

export const DEFAULT_PREFS: PracticePrefs = {
  view: 'both',
  showVideo: true,
  audio: 'video',
  sheetColors: true,
  sheetLetters: true,
  naming: 'letters',
  sheetZoom: 1,
  rewindS: 5,
  rewindOnMiss: false,
};

const VIEWS: readonly PracticeView[] = ['falling', 'sheet', 'both', 'video'];
const AUDIOS: readonly AudioSource[] = ['video', 'piano', 'both'];
const NAMINGS: readonly NamingStyle[] = ['letters', 'solfege'];

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function whole(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

/** The score and the video take the stage: the canvas keeps only the keyboard strip. */
export function isKeyboardOnly(view: PracticeView): boolean {
  return view === 'sheet' || view === 'video';
}

/** Reads stored preferences field by field: anything unknown or broken takes its default. */
export function parsePrefs(value: unknown): PracticePrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const v = value as Record<string, unknown>;
  return {
    view: pick(v['view'], VIEWS, DEFAULT_PREFS.view),
    showVideo: flag(v['showVideo'], DEFAULT_PREFS.showVideo),
    audio: pick(v['audio'], AUDIOS, DEFAULT_PREFS.audio),
    sheetColors: flag(v['sheetColors'], DEFAULT_PREFS.sheetColors),
    sheetLetters: flag(v['sheetLetters'], DEFAULT_PREFS.sheetLetters),
    naming: pick(v['naming'], NAMINGS, DEFAULT_PREFS.naming),
    sheetZoom: pick(v['sheetZoom'], SHEET_ZOOM_STEPS, DEFAULT_PREFS.sheetZoom),
    rewindS: whole(v['rewindS'], REWIND_MIN_S, REWIND_MAX_S, DEFAULT_PREFS.rewindS),
    rewindOnMiss: flag(v['rewindOnMiss'], DEFAULT_PREFS.rewindOnMiss),
  };
}

/** The next score size up or down, staying inside the steps. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const index = SHEET_ZOOM_STEPS.findIndex((z) => z >= current);
  const from = index < 0 ? SHEET_ZOOM_STEPS.length - 1 : index;
  const next = Math.min(Math.max(from + direction, 0), SHEET_ZOOM_STEPS.length - 1);
  return SHEET_ZOOM_STEPS[next] ?? current;
}
