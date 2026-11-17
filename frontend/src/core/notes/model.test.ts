import { note } from './fixtures';
import { filterByHand, groupIntoChords, visibleNotes } from './model';

describe('groupIntoChords', () => {
  it('returns nothing for no notes', () => {
    expect(groupIntoChords([])).toEqual([]);
  });

  it('groups near-simultaneous onsets into one chord sorted by pitch', () => {
    const chords = groupIntoChords([note(67, 1.02), note(60, 1.0), note(64, 1.04), note(72, 2)]);
    expect(chords).toHaveLength(2);
    expect(chords[0]?.notes.map((n) => n.pitch)).toEqual([60, 64, 67]);
    expect(chords[0]?.startS).toBe(1.0);
    expect(chords[1]?.notes).toHaveLength(1);
  });

  it('does not chain an arpeggio into a single chord', () => {
    const arpeggio = [note(60, 0), note(64, 0.04), note(67, 0.08), note(72, 0.12)];
    expect(groupIntoChords(arpeggio).length).toBeGreaterThan(1);
  });

  it('does not lose or invent notes', () => {
    const input = Array.from({ length: 40 }, (_, i) => note(40 + (i % 12), i * 0.03));
    const out = groupIntoChords(input).flatMap((c) => c.notes);
    expect(out.map((n) => n.id).sort((a, b) => a - b)).toEqual(input.map((n) => n.id));
  });
});

describe('visibleNotes', () => {
  const notes = [note(60, 0, 1), note(62, 5, 6), note(64, 20, 21)];

  it('keeps notes overlapping the window', () => {
    expect(visibleNotes(notes, 4, 3).map((n) => n.pitch)).toEqual([62]);
  });

  it('includes a note still sounding that started before the window', () => {
    expect(visibleNotes(notes, 0.5, 1).map((n) => n.pitch)).toEqual([60]);
  });

  it('honours the look-behind window', () => {
    expect(visibleNotes(notes, 7, 1, 2).map((n) => n.pitch)).toEqual([62]);
    expect(visibleNotes(notes, 7, 1, 0)).toEqual([]);
  });
});

describe('filterByHand', () => {
  it('filters one hand or keeps both', () => {
    const notes = [note(40, 0, 1, 'left'), note(70, 0, 1, 'right')];
    expect(filterByHand(notes, 'left').map((n) => n.pitch)).toEqual([40]);
    expect(filterByHand(notes, 'both')).toHaveLength(2);
  });
});
