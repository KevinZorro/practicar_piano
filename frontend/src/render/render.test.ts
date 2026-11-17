import { note } from '../core/notes/fixtures';
import { drawFrame, HAND_COLORS, type Drawing } from './drawFrame';
import { WHITE_KEY_COUNT, isBlackKey, keyBox } from './keyboardLayout';
import { noteRect, timeToY, type View } from './projection';

const view: View = { width: 1040, height: 400, aheadS: 4 };

describe('keyboard layout', () => {
  it('has 52 white keys and 36 black keys', () => {
    expect(WHITE_KEY_COUNT).toBe(52);
    const black = Array.from({ length: 88 }, (_, i) => 21 + i).filter(isBlackKey);
    expect(black).toHaveLength(36);
  });

  it('places the lowest and highest keys at the edges', () => {
    expect(keyBox(21, 1040).x).toBe(0);
    const last = keyBox(108, 1040);
    expect(last.x + last.width).toBeCloseTo(1040);
  });

  it('puts middle C where it belongs and keeps keys inside the keyboard', () => {
    const middleC = keyBox(60, 1040);
    expect(middleC.x).toBeCloseTo(23 * 20); // 23 white keys precede it, 20 px each
    for (let p = 21; p <= 108; p++) {
      const k = keyBox(p, 1040);
      expect(k.x).toBeGreaterThanOrEqual(-k.width / 2);
      expect(k.x + k.width).toBeLessThanOrEqual(1040 + k.width / 2);
    }
  });

  it('centres a black key on the boundary between its white neighbours', () => {
    const cSharp = keyBox(61, 1040);
    const c = keyBox(60, 1040);
    expect(cSharp.isBlack).toBe(true);
    expect(cSharp.x + cSharp.width / 2).toBeCloseTo(c.x + c.width);
    expect(cSharp.width).toBeLessThan(c.width);
  });

  it('rejects pitches outside the piano', () => {
    expect(() => keyBox(20, 100)).toThrow(RangeError);
    expect(() => keyBox(109, 100)).toThrow(RangeError);
  });
});

describe('projection', () => {
  it('maps now to the hit line and the look-ahead to the top', () => {
    expect(timeToY(10, 10, view)).toBe(400);
    expect(timeToY(14, 10, view)).toBe(0);
    expect(timeToY(12, 10, view)).toBe(200);
  });

  it('is monotonic: later notes are higher on screen', () => {
    expect(timeToY(11, 10, view)).toBeGreaterThan(timeToY(12, 10, view));
  });

  it('gives a note a height proportional to its duration', () => {
    const rect = noteRect(note(60, 12, 13), 10, view);
    expect(rect?.height).toBeCloseTo(100);
    expect(rect?.y).toBeCloseTo(100); // bottom edge at 200 px
  });

  it('keeps very short notes visible', () => {
    expect(noteRect(note(60, 12, 12.001), 10, view)?.height).toBe(3);
  });

  it('skips notes above or below the visible area', () => {
    expect(noteRect(note(60, 20, 21), 10, view)).toBeNull(); // not yet in view
    expect(noteRect(note(60, 1, 2), 10, view)).toBeNull(); // long gone
  });

  it('keeps a note that is crossing the hit line', () => {
    expect(noteRect(note(60, 9.5, 10.5), 10, view)).not.toBeNull();
  });
});

describe('drawFrame', () => {
  function recorder() {
    const fills: { style: unknown; rect: number[] }[] = [];
    const ctx: Drawing = {
      fillStyle: '',
      clearRect: () => undefined,
      fillRect(x, y, w, h) {
        fills.push({ style: this.fillStyle, rect: [x, y, w, h] });
      },
    };
    return { ctx, fills };
  }

  it('draws visible notes by hand colour and then the hit line', () => {
    const { ctx, fills } = recorder();
    const drawn = drawFrame(
      ctx,
      [note(60, 11, 12, 'right'), note(40, 12, 13, 'left'), note(70, 99, 100)],
      10,
      view,
    );
    expect(drawn).toBe(2);
    expect(fills.map((f) => f.style)).toEqual([HAND_COLORS.right, HAND_COLORS.left, '#ffffff']);
    expect(fills.at(-1)?.rect).toEqual([0, 400, 1040, 2]);
  });
});
