/** Note values of the reading guide, with their length in sixteenths. */
const SIXTEENTHS = { whole: 16, half: 8, quarter: 4, eighth: 2, '16th': 1 } as const;
export type NoteValue = keyof typeof SIXTEENTHS;

/** One written event: a note ("F#4"), a chord, or a rest when it has no pitch. */
export interface GuideEvent {
  readonly value: NoteValue;
  /** Scientific pitch names, lowest first: ["C4", "E4", "G4"]. Empty for a rest. */
  readonly pitches?: readonly string[];
  readonly dot?: boolean;
  readonly tie?: 'start' | 'stop';
}

export interface GuideExample {
  readonly clef: 'treble' | 'bass';
  readonly measures: readonly (readonly GuideEvent[])[];
  /** Beats and beat unit; null hides the time signature (it is not the point of the example). */
  readonly time?: readonly [number, number] | null;
  /** Sharps (positive) or flats (negative) in the key signature. */
  readonly fifths?: number;
}

const DIVISIONS = 4; // per quarter note, so a sixteenth is 1
const CLEF = { treble: { sign: 'G', line: 2 }, bass: { sign: 'F', line: 4 } } as const;

/** Splits "F#4" into MusicXML parts; throws on a name the guide should never contain. */
export function parsePitch(name: string): { step: string; alter: number; octave: number } {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!match) throw new Error(`Not a pitch name: ${name}`);
  const sign = match[2];
  return {
    step: match[1] ?? 'C',
    alter: sign === '#' ? 1 : sign === 'b' ? -1 : 0,
    octave: Number(match[3]),
  };
}

function pitchXml(name: string): string {
  const { step, alter, octave } = parsePitch(name);
  const alterXml = alter === 0 ? '' : `<alter>${String(alter)}</alter>`;
  return `<pitch><step>${step}</step>${alterXml}<octave>${String(octave)}</octave></pitch>`;
}

function eventXml(event: GuideEvent): string {
  const length = SIXTEENTHS[event.value] * (event.dot ? 1.5 : 1);
  const duration = `<duration>${String(length)}</duration>`;
  const tail = [
    event.tie ? `<tie type="${event.tie}"/>` : '',
    `<type>${event.value}</type>`,
    event.dot ? '<dot/>' : '',
    event.tie ? `<notations><tied type="${event.tie}"/></notations>` : '',
  ].join('');
  const pitches = event.pitches ?? [];
  if (pitches.length === 0) return `<note><rest/>${duration}<type>${event.value}</type></note>`;
  return pitches
    .map(
      (name, index) =>
        `<note>${index > 0 ? '<chord/>' : ''}${pitchXml(name)}${duration}${tail}</note>`,
    )
    .join('');
}

function attributesXml(example: GuideExample): string {
  const clef = CLEF[example.clef];
  const time = example.time
    ? `<time><beats>${String(example.time[0])}</beats><beat-type>${String(example.time[1])}</beat-type></time>`
    : '';
  return [
    '<attributes>',
    `<divisions>${String(DIVISIONS)}</divisions>`,
    `<key><fifths>${String(example.fifths ?? 0)}</fifths></key>`,
    time,
    `<clef><sign>${clef.sign}</sign><line>${String(clef.line)}</line></clef>`,
    '</attributes>',
  ].join('');
}

/** A one-staff MusicXML score for an example of the reading guide. */
export function guideScore(example: GuideExample): string {
  const measures = example.measures
    .map((events, index) => {
      const head = index === 0 ? attributesXml(example) : '';
      return `<measure number="${String(index + 1)}">${head}${events.map(eventXml).join('')}</measure>`;
    })
    .join('');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="3.1">',
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>',
    `<part id="P1">${measures}</part>`,
    '</score-partwise>',
  ].join('');
}

const q = (...pitches: string[]): GuideEvent => ({ value: 'quarter', pitches });

/** The examples of the guide, in reading order. */
export const GUIDE_EXAMPLES = {
  treble: {
    clef: 'treble',
    time: null,
    measures: [
      [q('C4'), q('D4'), q('E4'), q('F4')],
      [q('G4'), q('A4'), q('B4'), q('C5')],
    ],
  },
  bass: {
    clef: 'bass',
    time: null,
    measures: [
      [q('C3'), q('D3'), q('E3'), q('F3')],
      [q('G3'), q('A3'), q('B3'), q('C4')],
    ],
  },
  values: {
    clef: 'treble',
    time: [4, 4],
    measures: [
      [{ value: 'whole', pitches: ['G4'] }],
      [
        { value: 'half', pitches: ['G4'] },
        { value: 'half', pitches: ['G4'] },
      ],
      [q('G4'), q('G4'), q('G4'), q('G4')],
      Array.from({ length: 8 }, (): GuideEvent => ({ value: 'eighth', pitches: ['G4'] })),
    ],
  },
  rests: {
    clef: 'treble',
    time: [4, 4],
    measures: [
      [{ value: 'whole' }],
      [{ value: 'half' }, { value: 'quarter' }, { value: 'eighth' }, { value: 'eighth' }],
    ],
  },
  dotsAndTies: {
    clef: 'treble',
    time: [4, 4],
    measures: [
      [{ value: 'half', pitches: ['E4'], dot: true }, q('D4')],
      [q('C4'), q('D4'), { value: 'half', pitches: ['E4'], tie: 'start' }],
      [{ value: 'half', pitches: ['E4'], tie: 'stop' }, { value: 'half' }],
    ],
  },
  accidentals: {
    clef: 'treble',
    time: [4, 4],
    measures: [
      [q('F4'), q('F#4'), q('F4'), q('G4')],
      [q('B4'), q('Bb4'), q('A4'), { value: 'quarter' }],
    ],
  },
  meter: {
    clef: 'treble',
    time: [3, 4],
    fifths: 1,
    measures: [
      [q('G4'), q('F#4'), q('G4')],
      [{ value: 'half', pitches: ['A4'] }, q('D4')],
    ],
  },
  chords: {
    clef: 'treble',
    time: [4, 4],
    measures: [
      [
        { value: 'half', pitches: ['C4', 'E4', 'G4'] },
        { value: 'half', pitches: ['B3', 'D4', 'G4'] },
      ],
      [{ value: 'whole', pitches: ['C4', 'E4', 'G4'] }],
    ],
  },
} as const satisfies Record<string, GuideExample>;

export type GuideExampleName = keyof typeof GUIDE_EXAMPLES;
