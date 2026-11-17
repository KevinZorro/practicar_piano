import { describe, expect, it } from 'vitest';
import type { Note } from '../notes/model';
import { NoteTrigger } from './noteTrigger';
import { SynthPlayer } from './synthPlayer';

const note = (id: number, startS: number): Note => ({
  id,
  pitch: 60,
  startS,
  endS: startS + 0.4,
  velocity: 80,
  hand: 'right',
});

describe('NoteTrigger', () => {
  const notes = [note(0, 1), note(1, 1.2), note(2, 2)];

  it('returns each note once as the playhead crosses its start', () => {
    const trigger = new NoteTrigger(notes);
    trigger.advance(0.9);
    expect(trigger.advance(1.1).map((n) => n.id)).toEqual([0]);
    expect(trigger.advance(1.3).map((n) => n.id)).toEqual([1]);
    expect(trigger.advance(1.4)).toEqual([]);
  });

  it('does not replay or burst after a seek', () => {
    const trigger = new NoteTrigger(notes);
    trigger.advance(0.9);
    trigger.advance(1.3);
    expect(trigger.advance(0.5)).toEqual([]); // seek back
    expect(trigger.advance(0.6)).toEqual([]);
    expect(trigger.advance(5)).toEqual([]); // seek far ahead
  });

  it('plays nothing on the very first call', () => {
    expect(new NoteTrigger(notes).advance(1.1)).toEqual([]);
  });
});

describe('SynthPlayer', () => {
  it('counts time only while playing and honours the rate and seeks', () => {
    let wall = 0;
    const player = new SynthPlayer(() => wall);
    wall = 1000;
    expect(player.getCurrentTime()).toBe(0);
    player.play();
    wall = 3000;
    expect(player.getCurrentTime()).toBe(2);
    player.setPlaybackRate(0.5);
    wall = 5000;
    expect(player.getCurrentTime()).toBe(3);
    player.pause();
    wall = 9000;
    expect(player.getCurrentTime()).toBe(3);
    player.seekTo(10);
    expect(player.getCurrentTime()).toBe(10);
  });
});
