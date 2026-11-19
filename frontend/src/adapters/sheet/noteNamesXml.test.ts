import { readFileSync } from 'node:fs';
import { isNoteNameText, withNoteNames } from './noteNamesXml';

interface NoteOptions {
  chord?: boolean;
  alter?: number;
  tieStop?: boolean;
}

function note(step: string, octave: number, options: NoteOptions = {}): string {
  const alter = options.alter === undefined ? '' : `<alter>${String(options.alter)}</alter>`;
  return [
    '<note>',
    options.chord ? '<chord/>' : '',
    `<pitch><step>${step}</step>${alter}<octave>${String(octave)}</octave></pitch>`,
    '<duration>1</duration>',
    options.tieStop ? '<tie type="stop"/>' : '',
    '<type>quarter</type></note>',
  ].join('');
}

const score = (body: string) =>
  `<?xml version="1.0"?><score-partwise><part id="P1"><measure number="1">${body}</measure></part></score-partwise>`;

function lyrics(xml: string): string[][] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('note')).map((n) =>
    Array.from(n.getElementsByTagName('lyric')).map(
      (l) =>
        `${l.getAttribute('number') ?? ''}:${l.getElementsByTagName('text')[0]?.textContent ?? ''}`,
    ),
  );
}

describe('withNoteNames', () => {
  it('writes the letter of each note under it', () => {
    const xml = withNoteNames(score(note('C', 4) + note('E', 4)), 'letters');
    expect(lyrics(xml)).toEqual([['1:C'], ['1:E']]);
  });

  it('stacks a chord from the highest note down, on the chord’s first note', () => {
    const chord = note('C', 4) + note('E', 4, { chord: true }) + note('G', 4, { chord: true });
    expect(lyrics(withNoteNames(score(chord), 'letters'))).toEqual([['1:G', '2:E', '3:C'], [], []]);
  });

  it('writes accidentals with real signs, in solfège when asked', () => {
    const sharp = note('F', 4, { alter: 1 });
    const flat = note('B', 3, { alter: -1 });
    expect(lyrics(withNoteNames(score(sharp + flat), 'solfege'))).toEqual([['1:Fa♯'], ['1:Si♭']]);
  });

  it('skips rests and the second half of a tied note', () => {
    const rest = '<note><rest/><duration>1</duration></note>';
    const tied = note('D', 4, { tieStop: true });
    expect(lyrics(withNoteNames(score(rest + tied + note('A', 3)), 'letters'))).toEqual([
      [],
      [],
      ['1:A'],
    ]);
  });

  it('returns the input untouched when it is not XML', () => {
    expect(withNoteNames('not xml <', 'letters')).toBe('not xml <');
  });

  it('names every note of the real exercise and keeps it a valid score', () => {
    const fixture = JSON.parse(readFileSync('e2e/fixtures/result.json', 'utf-8')) as {
      levels: { name: string; score: { musicxml: string } | null }[];
    };
    const xml = fixture.levels.find((l) => l.name === 'playable')?.score?.musicxml ?? '';
    const named = withNoteNames(xml, 'letters');
    const doc = new DOMParser().parseFromString(named, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('lyric').length).toBeGreaterThan(20);
  });
});

describe('isNoteNameText', () => {
  it('recognises the names it writes and nothing else', () => {
    expect(isNoteNameText('C♯')).toBe('C');
    expect(isNoteNameText('Sol')).toBe('G');
    expect(isNoteNameText('Mi♭')).toBe('E');
    expect(isNoteNameText('12')).toBeNull();
    expect(isNoteNameText('Right hand')).toBeNull();
  });
});
