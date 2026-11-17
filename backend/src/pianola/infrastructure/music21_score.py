"""MusicXML from quantized notes, using music21 (BSD-3)."""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction

from pianola.domain.quantize import (
    BEATS_PER_MEASURE,
    CELLS_PER_BEAT,
    CELLS_PER_MEASURE,
    Hand,
    QuantizedPiece,
    QuantNote,
)
from pianola.domain.score import Score, build_timemap

# Note values a notehead can show, in cells (12 per quarter): from a whole note down to a
# sixteenth, including dotted values and triplets. Anything else is split and tied.
_WRITABLE = (48, 36, 24, 18, 16, 12, 9, 8, 6, 4, 3)


@dataclass(frozen=True, slots=True)
class _Event:
    start: int
    length: int
    pitches: tuple[int, ...]  # empty means a rest


def _monophonic(notes: list[QuantNote], total_cells: int) -> list[_Event]:
    """One hand as a single line of chords and rests, with no overlaps.

    Notes struck together form a chord; a chord lasts until the next strike of the same hand
    (or its shortest note, if that is sooner), so the staff stays readable.
    """
    by_start: dict[int, list[QuantNote]] = {}
    for n in notes:
        by_start.setdefault(n.start, []).append(n)
    starts = sorted(by_start)
    events: list[_Event] = []
    cursor = 0
    for index, start in enumerate(starts):
        group = by_start[start]
        next_start = starts[index + 1] if index + 1 < len(starts) else total_cells
        length = min(min(n.length for n in group), next_start - start)
        if start > cursor:
            events.append(_Event(cursor, start - cursor, ()))
        events.append(_Event(start, length, tuple(sorted(n.pitch for n in group))))
        cursor = start + length
    if cursor < total_cells:
        events.append(_Event(cursor, total_cells - cursor, ()))
    return events


def _split_at_barlines(event: _Event) -> list[_Event]:
    pieces: list[_Event] = []
    start, remaining = event.start, event.length
    while remaining > 0:
        room = CELLS_PER_MEASURE - start % CELLS_PER_MEASURE
        take = min(room, remaining)
        pieces.append(_Event(start, take, event.pitches))
        start += take
        remaining -= take
    return pieces


def _writable_parts(length: int) -> list[int]:
    """Split ``length`` into writable values, largest first; exact whenever possible.

    Lengths of 1, 2 or 5 cells have no exact split (the quantizer never produces them); the
    best cover below ``length`` is returned instead.
    """
    for total in range(length, 0, -1):
        found = _exact_split(total, 0)
        if found is not None:
            return found
    return []


def _exact_split(length: int, first: int) -> list[int] | None:
    if length == 0:
        return []
    for index in range(first, len(_WRITABLE)):
        value = _WRITABLE[index]
        if value <= length:
            rest = _exact_split(length - value, index)
            if rest is not None:
                return [value, *rest]
    return None


class Music21ScoreBuilder:
    def build(self, piece: QuantizedPiece) -> Score:
        from music21 import clef, meter, stream, tempo
        from music21.musicxml.m21ToXml import GeneralObjectExporter

        score = stream.Score()
        total_cells = max(piece.measure_count, 1) * CELLS_PER_MEASURE
        for hand, hand_clef in ((Hand.RIGHT, clef.TrebleClef()), (Hand.LEFT, clef.BassClef())):
            part = stream.Part()
            part.id = hand.value
            part.partName = "Right hand" if hand is Hand.RIGHT else "Left hand"
            notes = [n for n in piece.notes if n.hand is hand]
            self._fill(part, _monophonic(notes, total_cells), piece.measure_count)
            first = part.getElementsByClass(stream.Measure).first()
            if first is not None:
                first.insert(0, hand_clef)
                first.insert(0, meter.TimeSignature(f"{BEATS_PER_MEASURE}/4"))
                if hand is Hand.RIGHT:
                    first.insert(0, tempo.MetronomeMark(number=piece.tempo_bpm))
            score.insert(0, part)
        xml = GeneralObjectExporter(score).parse().decode("utf-8")
        return Score(musicxml=xml, timemap=build_timemap(piece), tempo_bpm=piece.tempo_bpm)

    def _fill(self, part: object, events: list[_Event], measures: int) -> None:
        from music21 import chord, note, stream
        from music21.stream import makeNotation

        if not isinstance(part, stream.Part):
            raise TypeError("expected a music21 Part")
        count = max(measures, 1)
        bars = [stream.Measure(number=m + 1) for m in range(count)]
        for event in events:
            # one flat list of writable values so ties also join pieces across barlines
            slots: list[tuple[int, int]] = []  # (start cell, length in cells)
            for piece in _split_at_barlines(event):
                cursor = piece.start
                for cells in _writable_parts(piece.length):
                    slots.append((cursor, cells))
                    cursor += cells
            for i, (start, cells) in enumerate(slots):
                quarter_length = Fraction(cells, CELLS_PER_BEAT)
                element: note.GeneralNote
                if not event.pitches:
                    element = note.Rest(quarterLength=quarter_length)
                elif len(event.pitches) == 1:
                    element = note.Note(midi=event.pitches[0], quarterLength=quarter_length)
                else:
                    element = chord.Chord(list(event.pitches), quarterLength=quarter_length)
                if event.pitches and len(slots) > 1:
                    _tie(element, first=i == 0, last=i == len(slots) - 1)
                offset = Fraction(start % CELLS_PER_MEASURE, CELLS_PER_BEAT)
                bars[start // CELLS_PER_MEASURE].insert(offset, element)
        for bar in bars:
            makeNotation.makeTupletBrackets(bar, inPlace=True)
            part.append(bar)


def _tie(element: object, *, first: bool, last: bool) -> None:
    from music21 import chord, note, tie

    kind = "start" if first else ("stop" if last else "continue")
    if isinstance(element, note.Note):
        element.tie = tie.Tie(kind)
    elif isinstance(element, chord.Chord):
        for n in element.notes:
            n.tie = tie.Tie(kind)
