import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STAGE_COLORS } from '../render/notePalette';
import { contrast } from '../testing/contrast';

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');

/** Custom properties declared in the first block that follows `marker`. */
function block(marker: string): Record<string, string> {
  const start = css.indexOf(marker);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    Array.from(body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi), (m) => [m[1] ?? '', m[2] ?? '']),
  );
}

const themes = {
  case: block(":root[data-screen='practice']"),
  paper: block(":root:not([data-screen='practice'])"),
};

describe.each(Object.entries(themes))('%s theme', (_, t) => {
  const get = (name: string) => {
    const value = t[name];
    if (!value) throw new Error(`missing --${name}`);
    return value;
  };

  it('keeps every text colour at AA on every surface', () => {
    for (const fg of ['text', 'text-2', 'text-3', 'danger']) {
      for (const bg of ['bg', 'surface', 'raised', 'hover']) {
        expect(contrast(get(fg), get(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the key buttons readable', () => {
    expect(contrast(get('primary-text'), get('primary'))).toBeGreaterThanOrEqual(7);
    expect(contrast(get('secondary-text'), get('secondary'))).toBeGreaterThanOrEqual(7);
  });

  it('makes focus rings and control borders visible (3:1 for graphics)', () => {
    for (const bg of ['bg', 'surface', 'raised']) {
      expect(contrast(get('focus'), get(bg)), `focus on ${bg}`).toBeGreaterThanOrEqual(3);
      expect(contrast(get('line-strong'), get(bg)), `border on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });
});

it('uses the same note colours as the canvas', () => {
  const notes = block(':root {\n  /* The score');
  for (const [letter, color] of Object.entries(STAGE_COLORS)) {
    expect(notes[`note-${letter.toLowerCase()}`]).toBe(color);
  }
});
