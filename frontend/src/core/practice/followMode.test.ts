import type { PlaybackClock } from '../clock/playbackClock';
import type { Note } from '../notes/model';
import { DEFAULT_FOLLOW_CONFIG, FollowMode, followAccuracy, type FollowStats } from './followMode';

class FakeClock implements PlaybackClock {
  time = 0;
  isPlaying = true;
  seeks: number[] = [];
  now = () => this.time;
  play = () => undefined;
  pause = () => undefined;
  setRate = () => undefined;
  seek = (t: number) => {
    this.seeks.push(t);
    this.time = t;
  };
}

const note = (id: number, pitch: number, startS: number, hand: Note['hand'] = 'right'): Note => ({
  id,
  pitch,
  startS,
  endS: startS + 0.4,
  velocity: 80,
  hand,
});

// C4 at 10 s, E4 at 12 s, G4 at 14 s.
const NOTES = [note(1, 60, 10), note(2, 64, 12), note(3, 67, 14)];

function setup(config: Partial<typeof DEFAULT_FOLLOW_CONFIG> = {}, notes = NOTES) {
  const clock = new FakeClock();
  const seen: FollowStats[] = [];
  const mode = new FollowMode(notes, 'both', clock, (s) => seen.push(s), {
    ...DEFAULT_FOLLOW_CONFIG,
    ...config,
  });
  return { clock, mode, seen };
}

describe('FollowMode', () => {
  it('counts a key that lands on a note of the song and leaves the song alone', () => {
    const { clock, mode } = setup();
    clock.time = 10.1;
    mode.noteOn(60, clock.time);
    expect(mode.snapshot).toEqual({ hits: 1, mistakes: 0, rewinds: 0 });
    expect(clock.seeks).toEqual([]);
  });

  it('goes back the chosen number of seconds on a key that matches nothing', () => {
    const { clock, mode } = setup({ rewindS: 8 });
    clock.time = 12;
    mode.noteOn(61, clock.time);
    expect(clock.seeks).toEqual([4]);
    expect(mode.snapshot).toEqual({ hits: 0, mistakes: 1, rewinds: 1 });
  });

  it('never goes back past the start', () => {
    const { clock, mode } = setup({ rewindS: 30 });
    clock.time = 12;
    mode.noteOn(61, clock.time);
    expect(clock.seeks).toEqual([0]);
  });

  it('treats the right pitch at the wrong moment as a mistake', () => {
    const { clock, mode } = setup();
    clock.time = 11; // C4 is due at 10 s: 1 s off is outside the window
    mode.noteOn(60, clock.time);
    expect(mode.snapshot.mistakes).toBe(1);
  });

  it('does not let the same note count twice', () => {
    const { clock, mode } = setup({ rewindS: 1 });
    clock.time = 10;
    mode.noteOn(60, clock.time);
    mode.noteOn(60, clock.time);
    expect(mode.snapshot).toEqual({ hits: 1, mistakes: 1, rewinds: 1 });
  });

  it('ignores more mistakes while the song is still settling after a rewind', () => {
    const { clock, mode } = setup({ rewindS: 5, coolOffS: 0.6 });
    clock.time = 12;
    mode.noteOn(61, clock.time); // rewinds to 7
    mode.noteOn(61, clock.time); // video still loading: clock is at 7
    clock.time = 7.3;
    mode.noteOn(61, clock.time);
    expect(clock.seeks).toEqual([7]);
    expect(mode.snapshot.rewinds).toBe(1);
    clock.time = 8;
    mode.noteOn(61, clock.time);
    expect(clock.seeks).toEqual([7, 3]);
  });

  it('lets notes be played again after a rewind', () => {
    const { clock, mode } = setup({ rewindS: 5 });
    clock.time = 10;
    mode.noteOn(60, clock.time);
    clock.time = 12;
    mode.noteOn(70, clock.time); // rewinds to 7, before the C4 at 10 s
    clock.time = 10;
    mode.noteOn(60, clock.time);
    expect(mode.snapshot.hits).toBe(2);
  });

  it('only counts a skipped chord when asked to, and only after the first key', () => {
    const off = setup({ rewindOnMiss: false });
    off.mode.noteOn(60, 10);
    off.clock.time = 13;
    off.mode.tick();
    expect(off.clock.seeks).toEqual([]);

    const on = setup({ rewindOnMiss: true, rewindS: 4 });
    on.clock.time = 13;
    on.mode.tick(); // nothing played yet: still getting ready
    expect(on.clock.seeks).toEqual([]);
    on.mode.noteOn(60, 10); // played C4 at the right time (to arm the judge)
    on.clock.time = 12.5; // E4 at 12 s went by unplayed
    on.mode.tick();
    expect(on.clock.seeks).toEqual([8.5]);
    expect(on.mode.snapshot.mistakes).toBe(1);
  });

  it('counts silence as a mistake once the keyboard is listening, after a lead-in', () => {
    const { clock, mode } = setup({ rewindOnMiss: true, rewindS: 4 });
    clock.time = 9.5;
    mode.tick(true); // listening begins: chords before 10.5 s do not count
    clock.time = 10.6; // C4 at 10 s went by, but it came before the lead-in ended
    mode.tick(true);
    expect(clock.seeks).toEqual([]);
    clock.time = 12.4; // E4 at 12 s went by and nothing was heard
    mode.tick(true);
    expect(clock.seeks).toEqual([8.4]);
    expect(mode.snapshot.mistakes).toBe(1);
  });

  it('does not count a chord that was played', () => {
    const { clock, mode } = setup({ rewindOnMiss: true });
    clock.time = 10;
    mode.noteOn(60, 10);
    clock.time = 11;
    mode.tick();
    expect(clock.seeks).toEqual([]);
  });

  it('forgets everything when the player moves by hand', () => {
    const { clock, mode } = setup({ rewindOnMiss: true });
    clock.time = 10;
    mode.noteOn(60, 10);
    mode.seek(0);
    clock.time = 20;
    mode.tick(); // disarmed: a new run starts from the next key
    expect(clock.seeks).toEqual([]);
  });

  it('judges only the chosen hand', () => {
    const clock = new FakeClock();
    const mode = new FollowMode(
      [note(1, 60, 1, 'right'), note(2, 40, 1, 'left')],
      'right',
      clock,
      () => undefined,
    );
    clock.time = 1;
    mode.noteOn(40, 1); // the left hand's note is not part of this exercise
    expect(mode.snapshot.mistakes).toBe(1);
  });
});

describe('followAccuracy', () => {
  it('is the share of right keys, and 1 when nothing was played', () => {
    expect(followAccuracy({ hits: 0, mistakes: 0, rewinds: 0 })).toBe(1);
    expect(followAccuracy({ hits: 9, mistakes: 1, rewinds: 1 })).toBe(0.9);
  });
});
