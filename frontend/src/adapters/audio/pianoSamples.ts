/**
 * Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0), one recording for every minor
 * third from A0 to C8 as published by Tonejs/audio. The files live in `public/samples/piano`
 * and are served by the app itself (the CSP only allows `'self'`).
 */
export const PIANO_SAMPLE_BASE_URL = `${import.meta.env.BASE_URL}samples/piano/`;

const NOTES_PER_OCTAVE = [
  ['A', 'A'],
  ['C', 'C'],
  ['D#', 'Ds'],
  ['F#', 'Fs'],
] as const;

/** Tone.js note name → file name, e.g. `D#4` → `Ds4.mp3`. */
export function pianoSampleUrls(): Record<string, string> {
  const urls: Record<string, string> = { A0: 'A0.mp3', C8: 'C8.mp3' };
  for (let octave = 1; octave <= 7; octave++) {
    for (const [note, file] of NOTES_PER_OCTAVE) {
      urls[`${note}${String(octave)}`] = `${file}${String(octave)}.mp3`;
    }
  }
  return urls;
}
