from __future__ import annotations

import pytest

from notacaida.domain.agreement import (
    NOTE_50MS,
    ONSET_100MS,
    agreement,
    best_pitch_shift,
    estimate_delay,
)
from notacaida.domain.notes import NoteEvent


def note(pitch: int, start: float, end: float | None = None) -> NoteEvent:
    return NoteEvent(pitch, start, start + 0.5 if end is None else end, 80)


SCALE = tuple(note(60 + i, i * 0.5) for i in range(8))


def test_identical_lists_agree_fully() -> None:
    result = agreement(SCALE, SCALE)

    assert (result.precision, result.recall, result.f1) == (1.0, 1.0, 1.0)
    assert result.median_onset_error_s == 0.0


def test_onsets_must_be_within_the_tolerance_and_on_the_same_key() -> None:
    estimate = (note(60, 0.049), note(62, 0.5), note(62, 1.06))

    result = agreement(SCALE[:3], estimate)

    assert result.matched == 1
    assert agreement(SCALE[:3], estimate, ONSET_100MS).matched == 2


def test_each_note_matches_once() -> None:
    reference = (note(60, 0.0),)
    estimate = (note(60, 0.0), note(60, 0.01))

    result = agreement(reference, estimate)

    assert result.matched == 1
    assert result.precision == pytest.approx(0.5)


def test_greedy_matching_still_finds_the_most_pairs() -> None:
    reference = (note(60, 0.0), note(60, 0.09))
    estimate = (note(60, 0.045), note(60, 0.13))

    assert agreement(reference, estimate).matched == 2


def test_offsets_count_only_with_the_note_criteria() -> None:
    reference = (note(60, 0.0, 1.0),)
    late_end = (note(60, 0.0, 1.3),)

    assert agreement(reference, late_end).matched == 1
    assert agreement(reference, late_end, NOTE_50MS).matched == 0
    assert agreement(reference, (note(60, 0.0, 1.15),), NOTE_50MS).matched == 1  # 20 % of 1 s


def test_a_constant_delay_is_measured_and_can_be_removed() -> None:
    late = tuple(NoteEvent(n.pitch, n.start_s + 0.08, n.end_s + 0.08, 80) for n in SCALE)

    assert agreement(SCALE, late).matched == 0
    assert estimate_delay(SCALE, late) == pytest.approx(0.08)
    assert agreement(SCALE, late, time_shift_s=-0.08).f1 == pytest.approx(1.0)


def test_best_pitch_shift_finds_a_misnamed_octave() -> None:
    octave_up = tuple(NoteEvent(n.pitch + 12, n.start_s, n.end_s, 80) for n in SCALE)

    shift, result = best_pitch_shift(SCALE, octave_up, range(-24, 25))

    assert shift == -12
    assert result.f1 == pytest.approx(1.0)


def test_empty_lists_score_zero_without_failing() -> None:
    result = agreement((), ())

    assert (result.f1, result.median_onset_error_s) == (0.0, None)
    assert estimate_delay(SCALE, ()) is None
