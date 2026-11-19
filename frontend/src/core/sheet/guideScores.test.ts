import { GUIDE_EXAMPLES, guideScore, parsePitch, type GuideExample } from './guideScores';

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

/** Sum of the durations in each measure, chords counted once. */
function measureLengths(doc: Document): number[] {
  return Array.from(doc.getElementsByTagName('measure')).map((m) =>
    Array.from(m.getElementsByTagName('note'))
      .filter((n) => n.getElementsByTagName('chord').length === 0)
      .reduce((sum, n) => sum + Number(n.getElementsByTagName('duration')[0]?.textContent), 0),
  );
}

describe('parsePitch', () => {
  it('reads letters, accidentals and octaves', () => {
    expect(parsePitch('C4')).toEqual({ step: 'C', alter: 0, octave: 4 });
    expect(parsePitch('F#4')).toEqual({ step: 'F', alter: 1, octave: 4 });
    expect(parsePitch('Bb3')).toEqual({ step: 'B', alter: -1, octave: 3 });
    expect(() => parsePitch('H2')).toThrow();
  });
});

describe('guideScore', () => {
  it.each(Object.entries(GUIDE_EXAMPLES))('writes a valid score for %s', (_, example) => {
    const doc = parse(guideScore(example));
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('measure').length).toBe(example.measures.length);
  });

  it('fills every measure of the examples with a time signature', () => {
    for (const example of Object.values(GUIDE_EXAMPLES) as GuideExample[]) {
      if (!example.time) continue;
      const [beats, unit] = example.time;
      const length = (beats * 16) / unit / 4; // in quarters
      expect(measureLengths(parse(guideScore(example)))).toEqual(
        example.measures.map(() => length * 4),
      );
    }
  });

  it('writes clefs, keys, chords, dots and ties the way MusicXML expects', () => {
    const doc = parse(guideScore(GUIDE_EXAMPLES.bass));
    expect(doc.querySelector('clef sign')?.textContent).toBe('F');
    expect(doc.querySelector('time')).toBeNull();
    const meter = parse(guideScore(GUIDE_EXAMPLES.meter));
    expect(meter.querySelector('key fifths')?.textContent).toBe('1');
    expect(meter.querySelector('beats')?.textContent).toBe('3');
    const chords = parse(guideScore(GUIDE_EXAMPLES.chords));
    expect(chords.getElementsByTagName('chord')).toHaveLength(6);
    const ties = parse(guideScore(GUIDE_EXAMPLES.dotsAndTies));
    expect(ties.getElementsByTagName('dot')).toHaveLength(1);
    expect(Array.from(ties.getElementsByTagName('tie')).map((t) => t.getAttribute('type'))).toEqual(
      ['start', 'stop'],
    );
  });
});
