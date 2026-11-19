import { note } from '../core/notes/fixtures';
import { drawFrame, HIT_GAP, KEYBOARD_HEIGHT, STAGE, type Drawing } from './drawFrame';
import {
  bothNames,
  displayName,
  letterOf,
  noteName,
  noteNameWithOctave,
  writtenName,
} from '../core/notes/names';
import { INK, PAPER_COLORS, STAGE_COLORS } from './notePalette';
import {
  MIN_FITTED_KEYS,
  WHITE_KEY_COUNT,
  fitKeyRange,
  isBlackKey,
  keyBox,
  whiteKeyCount,
} from './keyboardLayout';
import { noteRect, timeToY, type View } from './projection';
import { contrast } from '../testing/contrast';

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

  it('spreads a smaller range over the same width', () => {
    const range = { low: 48, high: 84 }; // C3 to C6: 22 white keys
    expect(whiteKeyCount(range)).toBe(22);
    expect(keyBox(48, 1100, range).x).toBe(0);
    expect(keyBox(84, 1100, range).x + keyBox(84, 1100, range).width).toBeCloseTo(1100);
    expect(keyBox(60, 1100, range).width).toBeCloseTo(50);
    expect(() => keyBox(47, 1100, range)).toThrow(RangeError);
  });
});

describe('fitKeyRange', () => {
  it('goes from a C to a C around the song, at least three octaves wide', () => {
    expect(fitKeyRange([48, 55, 60, 67])).toEqual({ low: 48, high: 84 });
    const wide = fitKeyRange([36, 96]);
    expect(wide).toEqual({ low: 36, high: 96 }); // a 61-key keyboard, C2 to C7
  });

  it('includes a C at the top edge and keeps at least the minimum span', () => {
    const range = fitKeyRange([72]);
    expect(range.high - range.low + 1).toBeGreaterThanOrEqual(MIN_FITTED_KEYS);
    expect(range.low % 12).toBe(0);
    expect(range.high % 12).toBe(0);
  });

  it('never leaves the piano', () => {
    expect(fitKeyRange([21, 23])).toEqual({ low: 21, high: 60 });
    expect(fitKeyRange([105, 108]).high).toBe(108);
  });

  it('centres on middle C when there is nothing to fit', () => {
    expect(fitKeyRange([])).toEqual({ low: 48, high: 84 });
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
  it('names pitches by letter and octave, with the spelling music21 writes', () => {
    expect(noteName(60)).toBe('C');
    expect(noteName(61)).toBe('C#');
    expect(noteName(63)).toBe('Eb');
    expect(noteName(70)).toBe('Bb');
    expect(noteNameWithOctave(60)).toBe('C4');
    expect(noteNameWithOctave(21)).toBe('A0');
    expect(noteNameWithOctave(108)).toBe('C8');
  });

  it('gives each pitch the letter it is written on', () => {
    expect([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].map(letterOf).join('')).toBe(
      'CCDEEFFGGABB',
    );
  });

  it('shows letters or solfège with real accidental signs', () => {
    expect(displayName(61, 'letters')).toBe('C♯');
    expect(displayName(63, 'solfege')).toBe('Mi♭');
    expect(displayName(67, 'solfege')).toBe('Sol');
    expect(writtenName('B', -1, 'letters')).toBe('B♭');
    expect(writtenName('F', 2, 'solfege')).toBe('Fa♯♯');
    expect(bothNames(60)).toBe('C (Do)');
  });
});

describe('note palette', () => {
  it('keeps the letters on every bar and key readable (AA for small text)', () => {
    for (const color of Object.values(STAGE_COLORS)) {
      expect(contrast(INK, color)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color, STAGE.ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps every note name and notehead readable on the score paper (AA for small text)', () => {
    for (const color of Object.values(PAPER_COLORS)) {
      expect(contrast(color, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color, '#fffdf8')).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('drawFrame', () => {
  type Shape = { style: unknown; rect: number[]; alpha: number };
  function recorder() {
    const fills: Shape[] = [];
    const rounds: Shape[] = [];
    const texts: { text: string; x: number; style: unknown }[] = [];
    let path: number[] = [];
    const ctx: Drawing = {
      fillStyle: '',
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      clearRect: () => undefined,
      fillRect(x, y, w, h) {
        fills.push({ style: this.fillStyle, rect: [x, y, w, h], alpha: this.globalAlpha });
      },
      fillText(text, x) {
        texts.push({ text, x, style: this.fillStyle });
      },
      measureText: (text) => ({ width: text.length * 6 }),
      beginPath() {
        path = [];
      },
      roundRect(x, y, w, h) {
        path = [x, y, w, h];
      },
      fill() {
        rounds.push({ style: this.fillStyle, rect: path, alpha: this.globalAlpha });
      },
    };
    return { ctx, fills, rounds, texts };
  }
  const keyTop = view.height + HIT_GAP;
  const keyFaces = (shapes: Shape[]) => shapes.filter((s) => s.rect[1] === keyTop);

  it('counts visible notes, colours them by note and draws the hit line above the keys', () => {
    const { ctx, fills, rounds } = recorder();
    const drawn = drawFrame(
      ctx,
      [note(60, 11, 12, 'right'), note(40, 12, 13, 'left'), note(70, 99, 100)],
      10,
      view,
    );
    expect(drawn).toBe(2);
    expect(rounds.some((r) => r.style === STAGE_COLORS.C && (r.rect[1] ?? 0) < view.height)).toBe(
      true,
    );
    expect(rounds.some((r) => r.style === STAGE_COLORS.E && (r.rect[1] ?? 0) < view.height)).toBe(
      true,
    );
    expect(fills.some((f) => f.rect.join() === [0, 400, 1040, 2].join())).toBe(true);
  });

  it('keeps each note inside the lane of its key', () => {
    const { ctx, rounds } = recorder();
    drawFrame(ctx, [note(60, 11, 12, 'right')], 10, view);
    const key = keyBox(60, view.width);
    const body = rounds.find((r) => r.style === STAGE_COLORS.C && (r.rect[1] ?? 0) < view.height);
    expect(body?.rect[0]).toBeGreaterThanOrEqual(key.x);
    expect((body?.rect[0] ?? 0) + (body?.rect[2] ?? 0)).toBeLessThanOrEqual(key.x + key.width);
  });

  it('labels the white keys, with the octave only on each C', () => {
    const range = { low: 48, high: 84 };
    const { ctx, texts } = recorder();
    drawFrame(ctx, [], 0, view, { range });
    const keyLabels = texts.filter((t) => t.style === STAGE.whiteKeyLabel);
    expect(keyLabels).toHaveLength(whiteKeyCount(range));
    expect(keyLabels.map((t) => t.text)).toEqual(expect.arrayContaining(['C3', 'C4', 'D', 'B']));
    expect(keyLabels.every((t) => !/[#♯♭]/.test(t.text))).toBe(true);
  });

  it('writes solfège names when asked', () => {
    const { ctx, texts } = recorder();
    drawFrame(ctx, [note(67, 10, 11)], 10.2, view, {
      range: { low: 48, high: 84 },
      naming: 'solfege',
    });
    expect(texts.map((t) => t.text)).toEqual(expect.arrayContaining(['Do4', 'Sol', 'Re']));
  });

  it('lights the key of a sounding note with the colour of the note', () => {
    const { ctx, rounds } = recorder();
    drawFrame(ctx, [note(64, 9, 11, 'right')], 10, view);
    expect(keyFaces(rounds).some((r) => r.style === STAGE_COLORS.E)).toBe(true);

    const idle = recorder();
    drawFrame(idle.ctx, [note(64, 11, 12, 'right')], 10, view);
    expect(keyFaces(idle.rounds).some((r) => r.style === STAGE_COLORS.E)).toBe(false);
  });

  it('marks keys the player is pressing', () => {
    const { ctx, fills } = recorder();
    drawFrame(ctx, [], 0, view, { pressed: new Set([61]) });
    const key = keyBox(61, view.width);
    expect(fills.some((f) => f.rect.join() === [key.x, keyTop, key.width, 4].join())).toBe(true);
  });

  it('draws the hand wait mode does not ask for faintly, and does not light its keys', () => {
    const { ctx, rounds } = recorder();
    drawFrame(ctx, [note(48, 9, 11, 'left'), note(64, 9, 11, 'right')], 10, view, {
      dimHand: 'left',
    });
    const left = rounds.find((r) => r.style === STAGE_COLORS.C && (r.rect[1] ?? 0) < view.height);
    expect(left?.alpha).toBeLessThan(0.5);
    expect(keyFaces(rounds).some((r) => r.style === STAGE_COLORS.C)).toBe(false);
    expect(keyFaces(rounds).some((r) => r.style === STAGE_COLORS.E)).toBe(true);
  });

  it('draws only the keyboard when there is no falling area', () => {
    const { ctx, rounds } = recorder();
    const drawn = drawFrame(
      ctx,
      [note(60, 9, 11)],
      10,
      { ...view, height: 0 },
      {
        keyboardHeight: KEYBOARD_HEIGHT,
      },
    );
    expect(drawn).toBe(0);
    expect(rounds.some((r) => r.style === STAGE_COLORS.C && r.rect[1] === HIT_GAP)).toBe(true);
  });
});
