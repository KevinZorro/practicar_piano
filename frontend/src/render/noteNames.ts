const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Letter name of a MIDI pitch, e.g. 60 -> "C", 61 -> "C#". */
export function noteName(pitch: number): string {
  return NAMES[pitch % 12] ?? '';
}

/** Name with its octave in scientific notation, e.g. 60 -> "C4", 21 -> "A0". */
export function noteNameWithOctave(pitch: number): string {
  return `${noteName(pitch)}${String(Math.floor(pitch / 12) - 1)}`;
}
