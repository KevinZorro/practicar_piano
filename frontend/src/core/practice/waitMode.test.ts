import type { PlaybackClock } from '../clock/playbackClock';
import { note } from '../notes/fixtures';
import type { PracticeState } from './machine';
import { WaitMode } from './waitMode';

class FakeClock implements PlaybackClock {
  time = 0;
  isPlaying = true;
  now = () => this.time;
  play = () => {
    this.isPlaying = true;
  };
  pause = () => {
    this.isPlaying = false;
  };
  seek = (t: number) => {
    this.time = t;
  };
  setRate = () => undefined;
}

const notes = [note(60, 10), note(64, 12), note(43, 12, 12.5, 'left')];

function setup(hand: 'both' | 'right' | 'left' = 'both') {
  const clock = new FakeClock();
  const seen: PracticeState[] = [];
  const wait = new WaitMode(notes, hand, clock, (s) => seen.push(s));
  return { clock, wait, seen };
}

describe('WaitMode', () => {
  it('stops the clock at the chord time and resumes when the key is pressed', () => {
    const { clock, wait } = setup();
    clock.time = 10.4;
    wait.tick();
    expect(clock.isPlaying).toBe(false);
    expect(clock.time).toBe(10);
    expect(wait.snapshot.status).toBe('waiting');
    wait.noteOn(60);
    expect(clock.isPlaying).toBe(true);
    expect(wait.snapshot.stats.chordsHit).toBe(1);
  });

  it('rewinds on a wrong key while waiting', () => {
    const { clock, wait } = setup();
    clock.time = 12.1;
    wait.noteOn(60); // the first chord is due: accepted
    clock.time = 12.2;
    wait.tick();
    expect(wait.snapshot.status).toBe('waiting');
    wait.noteOn(70);
    expect(wait.snapshot.stats.mistakes).toBe(1);
    expect(clock.time).toBe(7);
    expect(clock.isPlaying).toBe(true);
  });

  it('only expects the chosen hand', () => {
    const { clock, wait } = setup('left');
    clock.time = 10.5;
    wait.tick();
    expect(wait.snapshot.status).toBe('playing'); // the first left-hand chord is at 12
    clock.time = 12.2;
    wait.tick();
    expect(wait.snapshot.status).toBe('waiting');
    wait.noteOn(43);
    expect(wait.snapshot.status).toBe('finished');
  });

  it('moves the pointer when the position is changed by hand', () => {
    const { wait } = setup();
    wait.seek(11);
    expect(wait.snapshot.pointer).toBe(1);
  });

  it('reports only real changes', () => {
    const { clock, wait, seen } = setup();
    clock.time = 5;
    wait.tick();
    wait.tick();
    expect(seen).toHaveLength(0);
  });
});

describe('WaitMode.expectedPitches', () => {
  it('lists the pitches of the chord to play next and none when finished', () => {
    const clock = new FakeClock();
    const wait = new WaitMode([note(60, 1), note(64, 1)], 'both', clock, () => undefined);
    expect([...wait.expectedPitches()].sort()).toEqual([60, 64]);
    clock.time = 1;
    wait.noteOn(60);
    wait.noteOn(64);
    expect(wait.expectedPitches()).toEqual([]);
  });
});
