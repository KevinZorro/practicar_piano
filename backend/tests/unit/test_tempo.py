import random

import pytest

from pianola.domain.notes import NoteEvent
from pianola.domain.tempo import DEFAULT_BPM, estimate_tempo


def melody(
    bpm: float,
    beats: int = 64,
    subdivision: int = 2,
    start: float = 0.0,
    jitter: float = 0.0,
    seed: int = 1,
    skip: float = 0.0,
) -> list[NoteEvent]:
    """Notes on a grid of `subdivision` per beat with optional timing noise and missing notes."""
    rng = random.Random(seed)
    step = 60.0 / bpm / subdivision
    notes = []
    for i in range(beats * subdivision):
        if rng.random() < skip:
            continue
        t = start + i * step + rng.uniform(-jitter, jitter)
        notes.append(
            NoteEvent(60 + (i * 7) % 12, max(t, 0.0), max(t, 0.0) + step * 0.8, 70 + (i % 4) * 10)
        )
    return notes


@pytest.mark.parametrize("bpm", [60, 72, 90, 100, 110, 120, 140, 160])
def test_recovers_the_tempo_of_steady_melodies(bpm: int) -> None:
    result = estimate_tempo(melody(bpm))
    # an octave error (half or double) is accepted: it notates the same music
    candidates = (bpm, bpm * 2, bpm / 2)
    assert any(abs(result.bpm - c) / c < 0.02 for c in candidates), (bpm, result.bpm)
    assert result.confidence == "high"


@pytest.mark.parametrize("bpm", [90, 100, 110, 120])
def test_prefers_the_real_tempo_in_the_common_range(bpm: int) -> None:
    assert abs(estimate_tempo(melody(bpm)).bpm - bpm) / bpm < 0.02


def test_quarter_note_melody_and_sixteenth_runs() -> None:
    assert abs(estimate_tempo(melody(100, subdivision=1)).bpm - 100) < 2
    assert abs(estimate_tempo(melody(100, subdivision=4)).bpm - 100) < 2


def test_finds_the_grid_phase() -> None:
    result = estimate_tempo(melody(120, start=0.13))
    # a sixteenth at 120 bpm lasts 0.125 s, so a grid line sits at 0.13 modulo that
    distance = abs((result.grid_offset_s - 0.13) % result.grid_s)
    assert min(distance, result.grid_s - distance) < 0.01


def test_tolerates_missing_notes_and_light_jitter() -> None:
    result = estimate_tempo(melody(108, jitter=0.012, skip=0.3, seed=5))
    assert abs(result.bpm - 108) / 108 < 0.03
    assert result.confidence == "high"


def test_heavy_rubato_lowers_confidence() -> None:
    steady = estimate_tempo(melody(100, jitter=0.0))
    loose = estimate_tempo(melody(100, jitter=0.12, seed=3))
    assert loose.score < steady.score
    assert loose.confidence == "low"


def test_accelerando_is_reported_as_low_confidence() -> None:
    notes = []
    t = 0.0
    for i in range(120):
        notes.append(NoteEvent(60, t, t + 0.2, 80))
        t += 0.6 - i * 0.003  # speeds up from 100 to roughly 170 bpm
    assert estimate_tempo(notes).confidence == "low"


def test_chords_count_as_one_strike() -> None:
    notes = []
    for i in range(32):
        t = i * 0.5
        notes += [NoteEvent(p, t + j * 0.004, t + 0.4, 80) for j, p in enumerate((48, 52, 55, 60))]
    assert abs(estimate_tempo(notes).bpm - 120) < 2


def test_too_little_data_returns_the_default_with_low_confidence() -> None:
    for notes in ([], [NoteEvent(60, 1.0, 2.0, 80)] * 3):
        result = estimate_tempo(notes)
        assert result.bpm == DEFAULT_BPM
        assert result.confidence == "low"


def test_result_is_deterministic_and_within_bounds() -> None:
    notes = melody(133, jitter=0.01)
    assert estimate_tempo(notes) == estimate_tempo(notes)
    assert 50 <= estimate_tempo(notes).bpm <= 200
