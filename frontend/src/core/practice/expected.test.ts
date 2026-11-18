import { expectedNow } from './expected';
import type { Note } from '../notes/model';

const note = (id: number, pitch: number, startS: number): Note => ({
  id,
  pitch,
  startS,
  endS: startS + 0.5,
  velocity: 80,
  hand: 'right',
});

describe('expectedNow', () => {
  const notes = [note(1, 60, 1), note(2, 64, 2), note(3, 60, 2.1), note(4, 67, 5)];

  it('includes notes that just started and notes about to start, once per pitch', () => {
    expect(expectedNow(notes, 2.2).sort()).toEqual([60, 64]);
  });

  it('leaves out notes long gone and far in the future', () => {
    expect(expectedNow(notes, 3.5)).toEqual([]);
    expect(expectedNow(notes, 4.9)).toEqual([67]);
  });
});
