/**
 * Test-only: runs the detector on recorded piano notes (see `scripts/fetch-piano-samples.sh`)
 * played through a simulated speaker, room and microphone (`chain.ts`). The additive piano
 * of `simulate.ts` is too kind at both ends of the keyboard: its partials fall off as 1/h,
 * while a real low note has a weak fundamental and a real high note almost only has one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NoteDetector, type DetectorOptions } from '../noteDetector';
import { applyChain, type ChainOptions } from './chain';
import { analyserFrames, SAMPLE_RATE } from './simulate';

export const SAMPLE_SETS = ['fluid', 'musyng', 'salamander'] as const;
export type SampleSet = (typeof SAMPLE_SETS)[number];

const cache = new Map<string, Float32Array | null>();

/** One recorded note (48 kHz, mono), or null when the set has no recording of that pitch. */
export function loadNote(dir: string, set: SampleSet, pitch: number): Float32Array | null {
  const path = join(dir, set, `${String(pitch)}.f32`);
  const cached = cache.get(path);
  if (cached !== undefined) return cached;
  let note: Float32Array | null = null;
  if (existsSync(path)) {
    const buf = readFileSync(path);
    note = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
  }
  cache.set(path, note);
  return note;
}

export interface RecordedTrial {
  dir: string;
  set: SampleSet;
  played: readonly number[];
  expected: readonly number[];
  chain: ChainOptions;
  /** Peak of this set's C4 after scaling: the level the calibration would see. */
  level: number;
  seed: number;
  options?: Partial<DetectorOptions>;
  /** Notes struck `ringS` before the played ones and still sounding (a bass line). */
  previous?: readonly number[];
  ringS?: number;
}

export interface RecordedResult {
  /** Expected notes confirmed after the strike. */
  hits: Set<number>;
  /** Notes reported as wrong after the strike. */
  wrong: Set<number>;
}

const LEAD_S = 1.6;

/** Null when one of the notes has no recording in this set. */
export function runRecorded(t: RecordedTrial): RecordedResult | null {
  const ringS = t.ringS ?? 0.5;
  const strikeS = LEAD_S + (t.previous?.length ? ringS : 0);
  const parts = [
    ...(t.previous ?? []).map((pitch) => ({ pitch, at: LEAD_S })),
    ...t.played.map((pitch) => ({ pitch, at: strikeS })),
  ];
  const notes = parts.map((p) => ({ ...p, samples: loadNote(t.dir, t.set, p.pitch) }));
  const c4 = loadNote(t.dir, t.set, 60);
  if (!c4 || notes.some((n) => !n.samples)) return null;
  let peak = 0;
  for (const v of c4) peak = Math.max(peak, Math.abs(v));
  const gain = t.level / (peak || 1);
  const signal = new Float32Array(Math.floor((strikeS + 1.8) * SAMPLE_RATE));
  for (const n of notes) {
    const start = Math.floor(n.at * SAMPLE_RATE);
    const samples = n.samples ?? new Float32Array(0);
    for (let i = 0; i < samples.length && start + i < signal.length; i++)
      signal[start + i] = (signal[start + i] ?? 0) + (samples[i] ?? 0) * gain;
  }
  applyChain(signal, t.chain, t.seed);
  const detector = new NoteDetector(t.options);
  const result: RecordedResult = { hits: new Set(), wrong: new Set() };
  // The bass line: while the earlier notes ring, they are what the song expects.
  detector.setExpected(t.previous?.length ? t.previous : t.expected);
  for (const frame of analyserFrames(signal, 8192, 0.02)) {
    if (t.previous?.length && frame.timeS >= strikeS) detector.setExpected(t.expected);
    for (const e of detector.process(frame)) {
      if (e.timeS < strikeS - 0.01) continue;
      if (e.kind === 'hit' && t.expected.includes(e.pitch)) result.hits.add(e.pitch);
      if (e.kind === 'wrong') result.wrong.add(e.pitch);
    }
  }
  return result;
}
