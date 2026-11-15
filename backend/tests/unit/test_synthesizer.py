from __future__ import annotations

import wave
from pathlib import Path

import pytest

pretty_midi = pytest.importorskip("pretty_midi")

from pianola.infrastructure.synthesizer import AdditiveSynthesizer, SynthesisError  # noqa: E402


def write_midi(path: Path, notes: list[tuple[int, float, float]]) -> None:
    midi = pretty_midi.PrettyMIDI()
    piano = pretty_midi.Instrument(program=0)
    for pitch, start, end in notes:
        piano.notes.append(pretty_midi.Note(velocity=90, pitch=pitch, start=start, end=end))
    midi.instruments.append(piano)
    midi.write(str(path))


def read_wav(path: Path) -> tuple[int, int, int, bytes]:
    with wave.open(str(path), "rb") as handle:
        return (
            handle.getframerate(),
            handle.getnchannels(),
            handle.getnframes(),
            handle.readframes(handle.getnframes()),
        )


def test_render_writes_a_mono_16bit_wav_that_covers_the_whole_melody(tmp_path: Path) -> None:
    write_midi(tmp_path / "in.mid", [(60, 0.0, 0.5), (64, 0.5, 1.0), (67, 1.0, 2.0)])

    AdditiveSynthesizer().render(tmp_path / "in.mid", tmp_path / "out.wav")

    rate, channels, frames, data = read_wav(tmp_path / "out.wav")
    assert channels == 1
    assert frames / rate >= 2.0
    assert any(data), "the WAV must not be silent"


def test_render_normalizes_loud_chords_without_clipping(tmp_path: Path) -> None:
    write_midi(tmp_path / "in.mid", [(p, 0.0, 1.0) for p in range(48, 84, 3)])

    AdditiveSynthesizer().render(tmp_path / "in.mid", tmp_path / "out.wav")

    _, _, _, data = read_wav(tmp_path / "out.wav")
    samples = memoryview(data).cast("h")
    assert max(abs(s) for s in samples) < 32767


def test_render_handles_a_midi_without_notes(tmp_path: Path) -> None:
    write_midi(tmp_path / "in.mid", [])

    AdditiveSynthesizer().render(tmp_path / "in.mid", tmp_path / "out.wav")

    _, _, frames, _ = read_wav(tmp_path / "out.wav")
    assert frames > 0


def test_render_translates_invalid_midi_into_a_domain_error(tmp_path: Path) -> None:
    (tmp_path / "bad.mid").write_bytes(b"not a midi file")

    with pytest.raises(SynthesisError, match="synthesis failed"):
        AdditiveSynthesizer().render(tmp_path / "bad.mid", tmp_path / "out.wav")
