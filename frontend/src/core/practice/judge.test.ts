import { note } from '../notes/fixtures';
import { Judge } from './judge';

const song = [note(60, 1), note(62, 2), note(64, 3), note(60, 4)];

describe('Judge', () => {
  it('counts a key close to its note and leaves the rest as misses', () => {
    const judge = new Judge(song);
    judge.noteOn(60, 1.1);
    judge.noteOn(62, 2.05);
    expect(judge.result(5)).toMatchObject({ expected: 4, hit: 2, extra: 0, accuracy: 0.5 });
  });

  it('does not match a key outside the window or the wrong pitch', () => {
    const judge = new Judge(song);
    judge.noteOn(60, 1.5); // too late
    judge.noteOn(61, 2); // wrong pitch
    expect(judge.result(5)).toMatchObject({ hit: 0, extra: 2 });
  });

  it('uses each note once, so repeating a key does not score twice', () => {
    const judge = new Judge(song);
    judge.noteOn(64, 3);
    judge.noteOn(64, 3.05);
    expect(judge.result(5)).toMatchObject({ hit: 1, extra: 1 });
  });

  it('only asks for notes whose window has closed', () => {
    const judge = new Judge(song);
    expect(judge.result(2.2).expected).toBe(1); // 1.0 closed; 2.0 closes at 2.3
    expect(judge.result(0.5)).toMatchObject({ expected: 0, accuracy: 1 });
  });

  it('mashing keys scores badly', () => {
    const judge = new Judge(song);
    for (let pitch = 40; pitch < 80; pitch++) judge.noteOn(pitch, 2);
    expect(judge.result(5).accuracy).toBeLessThan(0.1);
  });

  it('starts over from a position', () => {
    const judge = new Judge(song);
    judge.noteOn(60, 1);
    judge.reset(3);
    expect(judge.result(5)).toMatchObject({ expected: 2, hit: 0, extra: 0 });
  });
});
