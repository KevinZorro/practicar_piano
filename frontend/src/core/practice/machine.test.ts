import { groupIntoChords } from '../notes/model';
import { note } from '../notes/fixtures';
import {
  DEFAULT_CONFIG,
  accuracy,
  initialState,
  step,
  type PracticeAction,
  type PracticeEvent,
  type PracticeState,
} from './machine';

// C major scale on the right hand, one note per second from t=10, then a C major chord at t=20.
const chords = groupIntoChords([
  note(60, 10),
  note(62, 11),
  note(64, 12),
  note(60, 20),
  note(64, 20),
  note(67, 20),
]);

function run(events: PracticeEvent[], from = initialState(chords)) {
  let state: PracticeState = from;
  const actions: PracticeAction[] = [];
  for (const event of events) {
    const result = step(state, event, chords);
    state = result.state;
    actions.push(...result.actions);
  }
  return { state, actions };
}

const tick = (timeS: number): PracticeEvent => ({ type: 'tick', timeS });
const press = (pitch: number, timeS: number): PracticeEvent => ({ type: 'noteOn', pitch, timeS });

describe('wait mode', () => {
  it('keeps playing while no chord is due', () => {
    const { state, actions } = run([tick(5), tick(9.99)]);
    expect(state.status).toBe('playing');
    expect(actions).toEqual([]);
  });

  it('pauses exactly at the chord time, even if the clock overshot', () => {
    const { state, actions } = run([tick(10.2)]);
    expect(state.status).toBe('waiting');
    expect(actions).toEqual([{ type: 'pause' }, { type: 'seek', timeS: 10 }]);
  });

  it('resumes and advances when the right key is played', () => {
    const { state, actions } = run([tick(10), press(60, 10.8)]);
    expect(state.status).toBe('playing');
    expect(state.pointer).toBe(1);
    expect(actions.at(-1)).toEqual({ type: 'resume' });
    expect(state.stats.chordsHit).toBe(1);
  });

  it('does not stall a player who hits the key slightly early', () => {
    const { state, actions } = run([press(60, 9.9), tick(10)]);
    expect(state.pointer).toBe(1);
    expect(actions).toEqual([]);
  });

  it('ignores a matching key that is far too early', () => {
    const { state } = run([press(60, 5)]);
    expect(state.pointer).toBe(0);
    expect(state.pressed.size).toBe(0);
  });

  it('ignores wrong keys while the song is still playing', () => {
    const { state, actions } = run([press(50, 3), tick(4)]);
    expect(state.stats.mistakes).toBe(0);
    expect(actions).toEqual([]);
  });

  it('rewinds the configured seconds on a wrong key while waiting', () => {
    const { state, actions } = run([
      tick(10),
      press(60, 10),
      tick(11),
      press(62, 11),
      tick(12),
      press(61, 12.5),
    ]);
    expect(actions.slice(-2)).toEqual([{ type: 'seek', timeS: 7 }, { type: 'resume' }]);
    expect(state.status).toBe('playing');
    expect(state.pointer).toBe(0); // replay from the first chord at or after t=7
    expect(state.stats).toMatchObject({ mistakes: 1, rewinds: 1 });
  });

  it('never rewinds before the start of the song', () => {
    const { actions } = run([tick(10), press(61, 10.5)]);
    expect(actions.at(-2)).toEqual({ type: 'seek', timeS: 5 });
    const early = groupIntoChords([note(60, 2)]);
    const waiting = step(initialState(early), { type: 'tick', timeS: 2 }, early).state;
    const wrong = step(waiting, { type: 'noteOn', pitch: 50, timeS: 3 }, early);
    expect(wrong.actions[0]).toEqual({ type: 'seek', timeS: 0 });
  });

  it('only counts the mistake when rewinding is disabled', () => {
    const waiting = step(initialState(chords), tick(10), chords).state;
    const result = step(waiting, press(61, 10.5), chords, {
      ...DEFAULT_CONFIG,
      rewindOnWrong: false,
    });
    expect(result.actions).toEqual([]);
    expect(result.state.status).toBe('waiting');
    expect(result.state.stats.mistakes).toBe(1);
  });

  it('needs every note of a chord, in any order', () => {
    const afterScale = run([
      tick(10),
      press(60, 10),
      tick(11),
      press(62, 11),
      tick(12),
      press(64, 12),
      tick(20),
    ]);
    expect(afterScale.state.status).toBe('waiting');
    const partial = run([press(67, 20.1)], afterScale.state);
    expect(partial.state.status).toBe('waiting');
    expect(partial.actions).toEqual([]);
    const done = run([press(64, 20.2), press(60, 20.3)], partial.state);
    expect(done.state.status).toBe('finished');
    expect(done.actions).toEqual([{ type: 'resume' }]);
  });

  it('is independent of playback speed because it works in song time', () => {
    const events = [tick(10), press(60, 10.5), tick(11), press(62, 12)];
    expect(run(events).state).toEqual(run(events).state);
    // a 50 % speed clock reports the same song times, only more ticks in between
    const slow = [tick(9), tick(9.5), tick(10), tick(10), press(60, 10.5), tick(10.5)];
    expect(run(slow).state.pointer).toBe(1);
  });

  it('does nothing after the last chord', () => {
    const { state, actions } = run([press(60, 99), tick(100)], {
      ...initialState(chords),
      pointer: 4,
    });
    expect(state.status).toBe('playing');
    expect(actions).toEqual([]);
    const end = initialState(chords, 999);
    expect(end.status).toBe('finished');
    expect(step(end, tick(1000), chords).actions).toEqual([]);
  });

  it('re-syncs the pointer when the user seeks by hand', () => {
    const { state } = run([tick(10), { type: 'seek', timeS: 11.5 }]);
    expect(state.status).toBe('playing');
    expect(state.pointer).toBe(2);
    expect(state.pressed.size).toBe(0);
  });
});

describe('accuracy', () => {
  it('is 1 with no attempts and the hit share otherwise', () => {
    expect(accuracy({ chordsHit: 0, mistakes: 0, rewinds: 0 })).toBe(1);
    expect(accuracy({ chordsHit: 9, mistakes: 1, rewinds: 1 })).toBeCloseTo(0.9);
  });
});
