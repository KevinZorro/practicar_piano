"""End-to-end check with a public-domain melody (Beethoven, "Ode to Joy", 1824).

The audio is generated at test time from notes written in code, so the repository
never contains a recording. Needs the ``basic-pitch`` and ``synth`` extras.
"""

from __future__ import annotations

from functools import partial
from pathlib import Path

import pytest

pretty_midi = pytest.importorskip("pretty_midi")
pytest.importorskip("basic_pitch")

from notacaida.domain.models import AudioFile  # noqa: E402
from notacaida.infrastructure.basic_pitch_transcriber import BasicPitchTranscriber  # noqa: E402
from notacaida.infrastructure.process_meter import SubprocessResourceMeter  # noqa: E402
from notacaida.infrastructure.synthesizer import AdditiveSynthesizer  # noqa: E402

pytestmark = pytest.mark.integration

# E E F G | G F E D | C C D E | E. D D(.)   in C major, quarter note = 0.5 s
ODE_TO_JOY = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62]
NOTE_SECONDS = 0.5


def write_reference_midi(path: Path) -> None:
    midi = pretty_midi.PrettyMIDI()
    piano = pretty_midi.Instrument(program=0)
    for index, pitch in enumerate(ODE_TO_JOY):
        start = index * NOTE_SECONDS
        piano.notes.append(
            pretty_midi.Note(velocity=95, pitch=pitch, start=start, end=start + NOTE_SECONDS * 0.9)
        )
    midi.instruments.append(piano)
    midi.write(str(path))


def test_basic_pitch_recovers_a_public_domain_melody_from_audio(tmp_path: Path) -> None:
    write_reference_midi(tmp_path / "reference.mid")
    AdditiveSynthesizer().render(tmp_path / "reference.mid", tmp_path / "ode.wav")
    audio = AudioFile(path=tmp_path / "ode.wav", duration_seconds=len(ODE_TO_JOY) * NOTE_SECONDS)

    measured = SubprocessResourceMeter().measure(
        partial(BasicPitchTranscriber().transcribe, audio, tmp_path / "out.mid")
    )

    assert measured.value.note_count > 0
    assert measured.usage.peak_rss_mb > 0
    transcribed = pretty_midi.PrettyMIDI(str(tmp_path / "out.mid"))
    notes = sorted(
        (n for inst in transcribed.instruments for n in inst.notes), key=lambda n: n.start
    )
    expected = [(i * NOTE_SECONDS, p) for i, p in enumerate(ODE_TO_JOY)]
    matched = sum(
        1
        for start, pitch in expected
        if any(abs(n.start - start) < 0.15 and n.pitch == pitch for n in notes)
    )
    assert matched / len(expected) >= 0.8, f"only {matched}/{len(expected)} notes recovered"
