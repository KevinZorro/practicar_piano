export type Hand = 'left' | 'right';

/** A note of the transcription, in song time (seconds at 100 % speed). */
export interface Note {
  readonly id: number;
  /** MIDI pitch, 21 (A0) to 108 (C8). */
  readonly pitch: number;
  readonly startS: number;
  readonly endS: number;
  /** MIDI velocity, 1 to 127. */
  readonly velocity: number;
  readonly hand: Hand;
}

/** Notes that start together (within the grouping window): played as one stroke. */
export interface Chord {
  readonly startS: number;
  readonly notes: readonly Note[];
}

/** Inclusive range of the 88-key piano. */
export const LOWEST_PITCH = 21;
export const HIGHEST_PITCH = 108;

const CHORD_WINDOW_S = 0.05;

/**
 * Groups notes whose onsets are within `windowS` of the first note of the group.
 * Input order does not matter; chords come out sorted by start time and notes by pitch.
 */
export function groupIntoChords(notes: readonly Note[], windowS = CHORD_WINDOW_S): Chord[] {
  const sorted = [...notes].sort((a, b) => a.startS - b.startS || a.pitch - b.pitch);
  const chords: Chord[] = [];
  let current: Note[] = [];
  let anchor = 0;
  for (const note of sorted) {
    if (current.length > 0 && note.startS - anchor > windowS) {
      chords.push(toChord(current));
      current = [];
    }
    if (current.length === 0) anchor = note.startS;
    current.push(note);
  }
  if (current.length > 0) chords.push(toChord(current));
  return chords;
}

function toChord(group: Note[]): Chord {
  const first = group[0];
  if (!first) throw new Error('empty chord');
  return { startS: first.startS, notes: [...group].sort((a, b) => a.pitch - b.pitch) };
}

/** Notes that overlap the window [nowS - behindS, nowS + aheadS], for drawing. */
export function visibleNotes(
  notes: readonly Note[],
  nowS: number,
  aheadS: number,
  behindS = 0,
): Note[] {
  const from = nowS - behindS;
  const to = nowS + aheadS;
  return notes.filter((n) => n.endS >= from && n.startS <= to);
}

export type HandFilter = Hand | 'both';

export function filterByHand(notes: readonly Note[], hand: HandFilter): Note[] {
  return hand === 'both' ? [...notes] : notes.filter((n) => n.hand === hand);
}
