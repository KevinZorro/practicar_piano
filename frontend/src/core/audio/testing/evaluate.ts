import { NoteDetector, type DetectionEvent, type DetectorOptions } from '../noteDetector';
import { analyserFrames, renderRoom, type RoomOptions, type Strike } from './simulate';

export interface Trial {
  expected: number[];
  played: number[];
  amplitude: number;
  room: RoomOptions;
  seed: number;
  /** Seconds of background before the strike. */
  leadS?: number;
  fftSize?: number;
  options?: Partial<DetectorOptions>;
  /** Optional earlier chord still ringing when the new one starts. */
  previous?: number[];
}

export interface TrialResult {
  events: DetectionEvent[];
  strikeS: number;
}

const HOP_S = 0.02;

export function runTrial(t: Trial): TrialResult {
  const leadS = t.leadS ?? 1.0;
  const strikeS = leadS + 0.6;
  const strikes: Strike[] = [
    ...(t.previous ?? []).map((pitch) => ({ pitch, startS: leadS - 0.3, amplitude: t.amplitude })),
    ...t.played.map((pitch) => ({ pitch, startS: strikeS, amplitude: t.amplitude })),
  ];
  const signal = renderRoom(strikeS + 1.2, strikes, t.room, t.seed);
  const detector = new NoteDetector(t.options);
  detector.setExpected(t.expected);
  const events: DetectionEvent[] = [];
  for (const frame of analyserFrames(signal, t.fftSize ?? 8192, HOP_S)) {
    events.push(...detector.process(frame));
  }
  return { events, strikeS };
}

/** Events that happened after the strike (the lead-in only builds the background). */
export function afterStrike(r: TrialResult, kind: 'hit' | 'wrong'): DetectionEvent[] {
  return r.events.filter((e) => e.kind === kind && e.timeS >= r.strikeS - 0.01);
}
