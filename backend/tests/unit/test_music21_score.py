from typing import TYPE_CHECKING, Any

import pytest

from notacaida.domain.notes import NoteEvent
from notacaida.domain.quantize import (
    CELLS_PER_BEAT,
    CELLS_PER_MEASURE,
    Hand,
    QuantizedPiece,
    QuantNote,
    quantize,
)
from notacaida.domain.score import build_timemap
from notacaida.domain.tempo import TempoEstimate

if TYPE_CHECKING:
    import music21.stream

music21 = pytest.importorskip("music21", reason="needs the 'score' extra")

from notacaida.infrastructure.music21_score import Music21ScoreBuilder, _writable_parts  # noqa: E402


def first_of(stream_: object, cls: str) -> Any:
    found = stream_.getElementsByClass(cls).first()  # type: ignore[attr-defined]
    assert found is not None
    return found


def q(pitch: int, start: int, length: int, hand: Hand | None = None) -> QuantNote:
    return QuantNote(pitch, start, length, 80, hand or (Hand.RIGHT if pitch >= 60 else Hand.LEFT))


def piece(*notes: QuantNote, bpm: float = 120.0) -> QuantizedPiece:
    return QuantizedPiece(tuple(sorted(notes, key=lambda n: (n.start, n.pitch))), bpm, 0.0)


def parse(xml: str) -> music21.stream.Score:
    parsed = music21.converter.parseData(xml, format="musicxml")
    assert isinstance(parsed, music21.stream.Score)
    return parsed


def test_writable_parts_cover_the_length_exactly() -> None:
    for length in [3, 4, *range(6, 200)]:
        assert sum(_writable_parts(length)) == length
    assert _writable_parts(48) == [48]
    assert _writable_parts(60) == [48, 12]
    assert _writable_parts(4) == [4]  # an eighth-note triplet


def test_output_is_valid_musicxml_that_music21_reads_back() -> None:
    score = Music21ScoreBuilder().build(piece(q(72, 0, 12), q(76, 12, 12), q(40, 0, 24)))
    assert score.musicxml.lstrip().startswith("<?xml")
    parsed = parse(score.musicxml)
    assert len(parsed.parts) == 2
    midi = sorted({p.midi for n in parsed.recurse().notes for p in n.pitches})
    assert midi == [40, 72, 76]


def test_hands_go_to_separate_staves_with_the_right_clefs() -> None:
    parsed = parse(Music21ScoreBuilder().build(piece(q(72, 0, 12), q(40, 0, 12))).musicxml)
    right, left = parsed.parts
    assert {p.midi for n in right.recurse().notes for p in n.pitches} == {72}
    assert {p.midi for n in left.recurse().notes for p in n.pitches} == {40}
    assert first_of(right.recurse(), "Clef").sign == "G"
    assert first_of(left.recurse(), "Clef").sign == "F"


def test_tempo_and_time_signature_are_written() -> None:
    parsed = parse(Music21ScoreBuilder().build(piece(q(60, 0, 12), bpm=96.0)).musicxml)
    assert first_of(parsed.recurse(), "MetronomeMark").number == 96
    assert first_of(parsed.recurse(), "TimeSignature").ratioString == "4/4"


def test_every_measure_adds_up_to_four_beats() -> None:
    notes = [q(60 + i % 5, i * 6, 6) for i in range(30)] + [q(48, 0, 100)]
    parsed = parse(Music21ScoreBuilder().build(piece(*notes)).musicxml)
    for part in parsed.parts:
        for measure in part.getElementsByClass("Measure"):
            assert measure.duration.quarterLength <= 4
    # a note crossing barlines is tied, not lost
    left = parsed.parts[1]
    ties = [n.tie.type for n in left.recurse().notes if n.tie is not None]
    assert "start" in ties
    assert "stop" in ties


def test_triplets_are_written_as_tuplets() -> None:
    notes = [q(72, i * 4, 4) for i in range(3)]
    parsed = parse(Music21ScoreBuilder().build(piece(*notes)).musicxml)
    durations = [n.duration for n in parsed.parts[0].recurse().notes]
    assert all(d.tuplets for d in durations)


def test_timemap_is_monotonic_and_inside_the_song() -> None:
    notes = [NoteEvent(60 + i % 7, i * 0.5, i * 0.5 + 0.4, 80) for i in range(40)]
    quantized = quantize(notes, TempoEstimate(120.0, 0.0, 1.0, "high"))
    score = Music21ScoreBuilder().build(quantized)
    starts = [m.start_s for m in score.timemap]
    assert starts == sorted(starts)
    assert [m.measure for m in score.timemap] == list(range(1, len(starts) + 1))
    assert starts[0] == pytest.approx(0.0)
    assert starts[-1] <= notes[-1].end_s
    assert starts[1] - starts[0] == pytest.approx(4 * 0.5)


def test_empty_piece_still_produces_a_readable_score() -> None:
    score = Music21ScoreBuilder().build(QuantizedPiece((), 100.0, 0.0))
    parse(score.musicxml)
    assert score.timemap == ()


def test_timemap_function_uses_the_origin_and_tempo() -> None:
    p = QuantizedPiece((q(60, 0, CELLS_PER_BEAT * 8),), 60.0, 2.0)
    assert [(m.measure, m.start_s) for m in build_timemap(p)] == [(1, 2.0), (2, 6.0)]
    assert CELLS_PER_MEASURE == 48
