import random

from teclario.domain.notes import NoteEvent
from teclario.domain.quantize import (
    CELLS_PER_BEAT,
    CELLS_PER_MEASURE,
    Hand,
    assign_hand,
    quantize,
)
from teclario.domain.tempo import TempoEstimate, estimate_tempo

BPM = 120.0
BEAT = 60 / BPM


def tempo(bpm: float = BPM, offset: float = 0.0) -> TempoEstimate:
    return TempoEstimate(bpm, offset, 1.0, "high")


def note(
    position_beats: float, length_beats: float, pitch: int = 64, velocity: int = 80
) -> NoteEvent:
    start = position_beats * BEAT
    return NoteEvent(pitch, start, start + length_beats * BEAT, velocity)


def test_sixteenth_positions_land_on_multiples_of_three_cells() -> None:
    notes = [note(i / 4, 0.25, 60 + i) for i in range(16)]
    piece = quantize(notes, tempo())
    assert [n.start for n in piece.notes] == [i * 3 for i in range(16)]
    assert all(n.length == 3 for n in piece.notes)


def test_triplet_beats_use_a_four_cell_grid() -> None:
    notes = [note(b + i / 3, 1 / 3, 60 + i) for b in range(4) for i in range(3)]
    piece = quantize(notes, tempo())
    assert [n.start for n in piece.notes] == [i * 4 for i in range(12)]
    assert all(n.length == 4 for n in piece.notes)


def test_a_piece_can_mix_straight_and_triplet_beats() -> None:
    notes = [
        note(0, 0.5, 60),
        note(0.5, 0.5, 62),
        note(1, 1 / 3, 64),
        note(1 + 1 / 3, 1 / 3, 65),
        note(1 + 2 / 3, 1 / 3, 67),
    ]
    starts = [n.start for n in quantize(notes, tempo()).notes]
    assert starts == [0, 6, 12, 16, 20]


def test_timing_noise_is_absorbed() -> None:
    rng = random.Random(4)
    notes = []
    for i in range(32):
        jitter = rng.uniform(-0.012, 0.012)
        start = i * BEAT / 2 + jitter
        notes.append(NoteEvent(60 + i % 12, max(start, 0.0), max(start, 0.0) + BEAT * 0.45, 80))
    piece = quantize(notes, tempo())
    assert [n.start for n in piece.notes] == [i * 6 for i in range(32)]


def test_first_note_defines_cell_zero_and_times_round_trip() -> None:
    notes = [note(0.0, 1.0, 60), note(1.0, 1.0, 62)]
    shifted = [NoteEvent(n.pitch, n.start_s + 2.0, n.end_s + 2.0, n.velocity) for n in notes]
    piece = quantize(shifted, tempo())
    assert piece.notes[0].start == 0
    assert abs(piece.time_of(piece.notes[0].start) - 2.0) < 1e-9
    assert abs(piece.time_of(piece.notes[1].start) - (2.0 + BEAT)) < 1e-9


def test_notes_are_never_lost_or_invented() -> None:
    rng = random.Random(9)
    notes = [
        NoteEvent(rng.randint(36, 96), t, t + rng.uniform(0.05, 1.5), rng.randint(20, 120))
        for t in (i * 0.19 + rng.uniform(0, 0.05) for i in range(200))
    ]
    piece = quantize(notes, estimate_tempo(notes))
    assert len(piece.notes) <= len(notes)
    assert len(piece.notes) >= len(notes) * 0.9  # only same-key-same-cell collisions merge
    assert {n.pitch for n in piece.notes} <= {n.pitch for n in notes}
    assert all(n.start >= 0 and n.length >= 3 for n in piece.notes)
    assert list(piece.notes) == sorted(piece.notes, key=lambda n: (n.start, n.pitch))


def test_same_key_in_the_same_cell_merges_into_the_longer_note() -> None:
    notes = [note(0, 0.25, 60), note(0.01, 1.0, 60)]
    piece = quantize(notes, tempo())
    assert len(piece.notes) == 1
    assert piece.notes[0].length == CELLS_PER_BEAT


def test_short_notes_get_at_least_one_grid_step() -> None:
    piece = quantize([note(0, 0.01, 60), note(1, 0.01, 62)], tempo())
    assert all(n.length >= 3 for n in piece.notes)


def test_hands_follow_the_middle_c_rule() -> None:
    assert assign_hand(59) is Hand.LEFT
    assert assign_hand(60) is Hand.RIGHT
    piece = quantize([note(0, 1, 40), note(0, 1, 72)], tempo())
    assert {n.pitch: n.hand for n in piece.notes} == {40: Hand.LEFT, 72: Hand.RIGHT}


def test_measure_count_covers_the_last_note() -> None:
    piece = quantize([note(0, 1, 60), note(7, 1, 62)], tempo())
    assert piece.measure_count == 2
    assert quantize([note(0, 4, 60)], tempo()).measure_count == 1
    assert piece.notes[-1].start + piece.notes[-1].length <= piece.measure_count * CELLS_PER_MEASURE


def test_empty_input() -> None:
    piece = quantize([], tempo())
    assert piece.notes == ()
    assert piece.measure_count == 0


def test_slower_tempo_scales_cells_not_musical_positions() -> None:
    slow_beat = 60 / 80
    notes = [
        NoteEvent(60 + i, i * slow_beat, i * slow_beat + slow_beat * 0.9, 80) for i in range(8)
    ]
    piece = quantize(notes, tempo(80))
    assert [n.start for n in piece.notes] == [i * CELLS_PER_BEAT for i in range(8)]
