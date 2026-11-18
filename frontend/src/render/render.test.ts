import { note } from '../core/notes/fixtures';
import { drawFrame, HAND_COLORS, KEYBOARD_HEIGHT, PRESSED_COLOR, type Drawing } from './drawFrame';
import { noteName, noteNameWithOctave } from './noteNames';
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

describe('note names', () => {
  it('names pitches by letter and octave', () => {
    expect(noteName(60)).toBe('C');
    expect(noteName(61)).toBe('C#');
    expect(noteNameWithOctave(60)).toBe('C4');
    expect(noteNameWithOctave(21)).toBe('A0');
    expect(noteNameWithOctave(108)).toBe('C8');
  });
});

describe('drawFrame', () => {
  function recorder() {
    const fills: { style: unknown; rect: number[] }[] = [];
    const texts: { text: string; x: number }[] = [];
    const ctx: Drawing = {
      fillStyle: '',
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      clearRect: () => undefined,
      fillRect(x, y, w, h) {
        fills.push({ style: this.fillStyle, rect: [x, y, w, h] });
      },
      fillText(text, x) {
        texts.push({ text, x });
      },
    };
    return { ctx, fills, texts };
  }

  it('counts visible notes and draws the hit line above the keyboard', () => {
    const { ctx, fills } = recorder();
    const drawn = drawFrame(
      ctx,
      [note(60, 11, 12, 'right'), note(40, 12, 13, 'left'), note(70, 99, 100)],
      10,
      view,
    );
    expect(drawn).toBe(2);
    expect(fills.some((f) => f.style === HAND_COLORS.right)).toBe(true);
    expect(fills.some((f) => f.style === HAND_COLORS.left)).toBe(true);
    expect(fills.some((f) => f.rect.join() === [0, 400, 1040, 2].join())).toBe(true);
  });

  it('keeps each note inside the lane of its key', () => {
    const { ctx, fills } = recorder();
    drawFrame(ctx, [note(60, 11, 12, 'right')], 10, view);
    const key = keyBox(60, view.width);
    const body = fills.find((f) => f.style === HAND_COLORS.right && (f.rect[1] ?? 0) < view.height);
    expect(body?.rect[0]).toBeGreaterThanOrEqual(key.x);
    expect((body?.rect[0] ?? 0) + (body?.rect[2] ?? 0)).toBeLessThanOrEqual(key.x + key.width);
  });

  it('draws 52 white key labels, with the octave only on each C', () => {
    const { ctx, texts } = recorder();
    drawFrame(ctx, [], 0, view);
    expect(texts).toHaveLength(WHITE_KEY_COUNT);
    expect(texts.filter((t) => /\d/.test(t.text)).map((t) => t.text)).toContain('C4');
    expect(texts.every((t) => !t.text.includes('#'))).toBe(true);
  });

  it('lights the key of a sounding note with the hand colour', () => {
    const { ctx, fills } = recorder();
    const keyTop = view.height + 2;
    const lit = (fs: typeof fills) =>
      fs.filter((f) => f.rect[1] === keyTop && f.rect[3] === KEYBOARD_HEIGHT);
    drawFrame(ctx, [note(60, 9, 11, 'left')], 10, view);
    expect(lit(fills).some((f) => f.style === HAND_COLORS.left)).toBe(true);

    const idle = recorder();
    drawFrame(idle.ctx, [note(60, 11, 12, 'left')], 10, view);
    expect(lit(idle.fills).some((f) => f.style === HAND_COLORS.left)).toBe(false);
  });

  it('lights keys the player is pressing', () => {
    const { ctx, fills } = recorder();
    drawFrame(ctx, [], 0, view, { pressed: new Set([61]) });
    expect(fills.some((f) => f.style === PRESSED_COLOR)).toBe(true);
  });
});
