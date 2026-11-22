import { HIT_GAP } from './drawFrame';
import { stageLayout } from './stageLayout';

describe('stageLayout', () => {
  it('gives the keys a height that follows their width and the rest to the falling notes', () => {
    const layout = stageLayout(880, 500, 22, 'falling');
    expect(layout.keyboardHeight).toBe(136); // 40 px keys
    expect(layout.fallHeight).toBe(500 - HIT_GAP - 136);
  });

  it('never lets the keyboard take more than about a third of a short stage', () => {
    const layout = stageLayout(1400, 300, 22, 'both');
    expect(layout.keyboardHeight).toBe(96);
    expect(layout.fallHeight).toBe(300 - HIT_GAP - 96);
  });

  it('keeps narrow keyboards tall enough to touch the keys and read their letters', () => {
    expect(stageLayout(390, 420, 36, 'falling').keyboardHeight).toBe(56);
  });

  it('shows only the keyboard strip under the score or the video', () => {
    for (const view of ['sheet', 'video'] as const) {
      expect(stageLayout(900, 90, 22, view)).toMatchObject({
        fallHeight: 0,
        keyboardHeight: 90 - HIT_GAP,
      });
    }
  });

  it('shows more seconds ahead on a taller stage, within limits', () => {
    expect(stageLayout(900, 200, 22, 'falling').aheadS).toBe(2.5);
    expect(stageLayout(900, 480, 22, 'falling').aheadS).toBeCloseTo(3.4, 1);
    expect(stageLayout(900, 1400, 22, 'falling').aheadS).toBe(4.5);
  });

  it('copes with a stage that has no room yet', () => {
    expect(stageLayout(0, 0, 0, 'both')).toMatchObject({ fallHeight: 0, keyboardHeight: 0 });
  });
});
