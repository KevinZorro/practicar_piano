"""The octave check on audio drawn from known notes: no model, no network."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from notacaida.domain.errors import NotacaidaError
from notacaida.domain.models import AudioFile
from notacaida.domain.notes import NoteEvent
from notacaida.infrastructure.octave_check import AudioOctaveEstimator
from tests.support.pieces import ode_to_joy, stress
from tests.support.tones import tones


def read_off_by(notes: tuple[NoteEvent, ...], semitones: int) -> tuple[NoteEvent, ...]:
    """What a reader that put the keyboard ``semitones`` too high would have read."""
    return tuple(replace(n, pitch=n.pitch + semitones) for n in notes)


@pytest.mark.parametrize("off", [-12, 0, 12, 24])
def test_the_shift_that_undoes_the_reading_error_is_heard(tmp_path: Path, off: int) -> None:
    played = ode_to_joy()
    audio = tones(played, tmp_path / "song.wav")

    estimate = AudioOctaveEstimator().estimate(read_off_by(played, off), audio)

    assert estimate is not None
    assert estimate.shift == -off
    assert estimate.margin >= 1.0  # clear on a clean recording
    assert dict(estimate.scores)[estimate.shift] == max(s for _, s in estimate.scores)


def test_octave_doubled_notes_do_not_confuse_it(tmp_path: Path) -> None:
    melody = tuple(n for n in ode_to_joy() if n.pitch >= 72)
    doubled = (*melody, *(replace(n, pitch=n.pitch - 12) for n in melody))  # bass an octave under
    audio = tones(doubled, tmp_path / "doubled.wav")

    estimate = AudioOctaveEstimator().estimate(read_off_by(doubled, 12), audio)

    assert estimate is not None and estimate.shift == -12


def test_a_reading_that_already_spans_the_piano_cannot_move(tmp_path: Path) -> None:
    played = stress()
    audio = tones(played, tmp_path / "stress.wav")

    assert AudioOctaveEstimator().estimate(played, audio) is None  # only shift 0 fits


def test_only_notes_that_last_are_listened_to(tmp_path: Path) -> None:
    played = tuple(NoteEvent(72, 1.0 + i, 1.05 + i, 80) for i in range(5))  # 50 ms blips
    audio = tones(played, tmp_path / "blips.wav")

    assert AudioOctaveEstimator().estimate(played, audio) is None


def test_audio_that_is_not_a_wav_is_an_error(tmp_path: Path) -> None:
    broken = tmp_path / "broken.wav"
    broken.write_bytes(b"not audio at all")

    with pytest.raises(NotacaidaError):
        AudioOctaveEstimator().estimate(ode_to_joy(), AudioFile(broken, 5.0))


def test_the_same_notes_give_the_same_answer_whatever_the_cap(tmp_path: Path) -> None:
    played = ode_to_joy()
    audio = tones(played, tmp_path / "song.wav")

    capped = AudioOctaveEstimator(max_notes=10).estimate(read_off_by(played, 12), audio)

    assert capped is not None and capped.shift == -12
    assert capped.notes_used <= 10
