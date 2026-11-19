import { LETTERS, writtenName, type Letter } from '../../core/notes/names';
import type { NamingStyle } from '../../core/practice/prefs';

const STEP_INDEX: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

interface WrittenNote {
  readonly letter: Letter;
  readonly alter: number;
  readonly height: number;
}

function isLetter(value: string): value is Letter {
  return (LETTERS as readonly string[]).includes(value);
}

function childText(el: Element, tag: string): string | null {
  for (const child of Array.from(el.children)) {
    if (child.tagName === tag) return child.textContent.trim();
  }
  return null;
}

function hasChild(el: Element, tag: string): boolean {
  return Array.from(el.children).some((c) => c.tagName === tag);
}

/** The note's written pitch, or null for a rest or a note that only continues a tie. */
function written(note: Element): WrittenNote | null {
  const pitch = Array.from(note.children).find((c) => c.tagName === 'pitch');
  if (!pitch) return null;
  const continuesTie = Array.from(note.children).some(
    (c) => c.tagName === 'tie' && c.getAttribute('type') === 'stop',
  );
  if (continuesTie) return null;
  const step = childText(pitch, 'step') ?? '';
  if (!isLetter(step)) return null;
  const alter = Math.round(Number(childText(pitch, 'alter') ?? '0')) || 0;
  const octave = Number(childText(pitch, 'octave') ?? '4');
  return { letter: step, alter, height: octave * 12 + STEP_INDEX[step] + alter };
}

/** Notes sounding together: a note with `<chord/>` joins the note before it. */
function chords(measure: Element): Element[][] {
  const groups: Element[][] = [];
  for (const child of Array.from(measure.children)) {
    if (child.tagName !== 'note') continue;
    const last = groups[groups.length - 1];
    if (hasChild(child, 'chord') && last) last.push(child);
    else groups.push([child]);
  }
  return groups;
}

/**
 * Writes the name of every note under its staff, the way a teacher pencils them in for a
 * beginner. The names travel as lyrics, so the renderer lays them out without collisions; a
 * chord stacks its names from the highest note down. Returns the input when it cannot parse.
 */
export function withNoteNames(musicxml: string, naming: NamingStyle): string {
  const doc = new DOMParser().parseFromString(musicxml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return musicxml;
  for (const measure of Array.from(doc.getElementsByTagName('measure'))) {
    for (const group of chords(measure)) {
      const anchor = group[0];
      if (!anchor) continue;
      const names = group
        .map(written)
        .filter((n): n is WrittenNote => n !== null)
        .sort((a, b) => b.height - a.height)
        .map((n) => writtenName(n.letter, n.alter, naming));
      for (const note of group) {
        for (const old of Array.from(note.children)) if (old.tagName === 'lyric') old.remove();
      }
      const before = Array.from(anchor.children).find(
        (c) => c.tagName === 'play' || c.tagName === 'listen',
      );
      names.forEach((name, index) => {
        const lyric = doc.createElement('lyric');
        lyric.setAttribute('number', String(index + 1));
        const syllabic = doc.createElement('syllabic');
        syllabic.textContent = 'single';
        const text = doc.createElement('text');
        text.textContent = name;
        lyric.append(syllabic, text);
        anchor.insertBefore(lyric, before ?? null);
      });
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

/** Every name `withNoteNames` can write, to find them again in the drawn score. */
export function isNoteNameText(text: string): Letter | null {
  const match = /^(Do|Re|Mi|Fa|Sol|La|Si|[A-G])[♯♭]*$/.exec(text.trim());
  if (!match) return null;
  const head = match[1] ?? '';
  const fromSolfege: Record<string, Letter> = {
    Do: 'C',
    Re: 'D',
    Mi: 'E',
    Fa: 'F',
    Sol: 'G',
    La: 'A',
    Si: 'B',
  };
  const letter = fromSolfege[head] ?? head;
  return isLetter(letter) ? letter : null;
}
