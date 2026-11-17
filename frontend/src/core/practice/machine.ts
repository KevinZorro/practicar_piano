import type { Chord } from '../notes/model';

export interface PracticeConfig {
  /** Seconds to go back when the player hits a wrong key while the song waits. */
  readonly rewindS: number;
  /** When false, wrong keys are counted but the song just keeps waiting. */
  readonly rewindOnWrong: boolean;
  /** How early (seconds) a key counts for the next chord, so fast players do not stall. */
  readonly earlyWindowS: number;
}

export const DEFAULT_CONFIG: PracticeConfig = {
  rewindS: 5,
  rewindOnWrong: true,
  earlyWindowS: 0.25,
};

export type PracticeStatus = 'playing' | 'waiting' | 'finished';

export interface PracticeStats {
  readonly chordsHit: number;
  readonly mistakes: number;
  readonly rewinds: number;
}

export interface PracticeState {
  readonly status: PracticeStatus;
  /** Index of the chord the player has to play next. */
  readonly pointer: number;
  /** Expected pitches already pressed for the chord at `pointer`. */
  readonly pressed: ReadonlySet<number>;
  readonly stats: PracticeStats;
}

export type PracticeEvent =
  /** The shared clock moved to `timeS` (song time, independent of playback speed). */
  | { readonly type: 'tick'; readonly timeS: number }
  | { readonly type: 'noteOn'; readonly pitch: number; readonly timeS: number }
  /** The user moved the video position by hand. */
  | { readonly type: 'seek'; readonly timeS: number };

export type PracticeAction =
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'seek'; readonly timeS: number };

export interface StepResult {
  readonly state: PracticeState;
  readonly actions: readonly PracticeAction[];
}

export function initialState(chords: readonly Chord[], fromS = 0): PracticeState {
  return stateAt(chords, fromS, { chordsHit: 0, mistakes: 0, rewinds: 0 });
}

function stateAt(chords: readonly Chord[], timeS: number, stats: PracticeStats): PracticeState {
  const pointer = chords.findIndex((c) => c.startS >= timeS);
  return {
    status: pointer === -1 ? 'finished' : 'playing',
    pointer: pointer === -1 ? chords.length : pointer,
    pressed: new Set(),
    stats,
  };
}

function expectedPitches(chord: Chord): Set<number> {
  return new Set(chord.notes.map((n) => n.pitch));
}

/**
 * Pure transition of the wait-mode machine. It knows nothing about the video player: it
 * returns actions for the caller to apply. `chords` must already be filtered by hand.
 */
export function step(
  state: PracticeState,
  event: PracticeEvent,
  chords: readonly Chord[],
  config: PracticeConfig = DEFAULT_CONFIG,
): StepResult {
  if (event.type === 'seek') {
    return { state: stateAt(chords, event.timeS, state.stats), actions: [] };
  }
  const chord = chords[state.pointer];
  if (!chord || state.status === 'finished') return { state, actions: [] };

  if (event.type === 'tick') return onTick(state, chord, event.timeS, chords.length);
  return onNoteOn(state, chord, chords, event, config);
}

function onTick(state: PracticeState, chord: Chord, timeS: number, total: number): StepResult {
  if (state.status !== 'playing' || timeS < chord.startS) return { state, actions: [] };
  const expected = expectedPitches(chord);
  if (hasAll(state.pressed, expected)) return advance(state, total, []);
  // The clock may overshoot; go back to the exact chord time so nothing is skipped.
  return {
    state: { ...state, status: 'waiting' },
    actions: [{ type: 'pause' }, { type: 'seek', timeS: chord.startS }],
  };
}

function onNoteOn(
  state: PracticeState,
  chord: Chord,
  chords: readonly Chord[],
  event: { readonly pitch: number; readonly timeS: number },
  config: PracticeConfig,
): StepResult {
  const expected = expectedPitches(chord);
  if (expected.has(event.pitch)) {
    if (state.status === 'playing' && event.timeS < chord.startS - config.earlyWindowS) {
      return { state, actions: [] }; // too early: probably the previous chord still ringing
    }
    const pressed = new Set(state.pressed).add(event.pitch);
    const next = { ...state, pressed };
    if (!hasAll(pressed, expected)) return { state: next, actions: [] };
    return advance(next, chords.length, state.status === 'waiting' ? [{ type: 'resume' }] : []);
  }
  // A wrong key only counts while the song is waiting for the player.
  if (state.status !== 'waiting') return { state, actions: [] };
  const stats = { ...state.stats, mistakes: state.stats.mistakes + 1 };
  if (!config.rewindOnWrong) return { state: { ...state, stats }, actions: [] };
  const target = Math.max(0, chord.startS - config.rewindS);
  const back = stateAt(chords, target, { ...stats, rewinds: stats.rewinds + 1 });
  return { state: back, actions: [{ type: 'seek', timeS: target }, { type: 'resume' }] };
}

function advance(
  state: PracticeState,
  total: number,
  actions: readonly PracticeAction[],
): StepResult {
  const pointer = state.pointer + 1;
  return {
    state: {
      status: pointer >= total ? 'finished' : 'playing',
      pointer,
      pressed: new Set(),
      stats: { ...state.stats, chordsHit: state.stats.chordsHit + 1 },
    },
    actions,
  };
}

function hasAll(pressed: ReadonlySet<number>, expected: ReadonlySet<number>): boolean {
  for (const pitch of expected) if (!pressed.has(pitch)) return false;
  return true;
}

/** Share of attempted chords played without a wrong key, in [0, 1]; 1 when nothing was tried. */
export function accuracy(stats: PracticeStats): number {
  const attempts = stats.chordsHit + stats.mistakes;
  return attempts === 0 ? 1 : stats.chordsHit / attempts;
}
