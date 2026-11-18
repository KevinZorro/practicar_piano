"""Pure-Python additive piano-like synthesizer (no soundfonts, no GPL dependencies).

Not a real piano: a few decaying harmonics per note are enough to judge by ear whether a
transcription is recognizable. Swap in a FluidSynth adapter behind the same port if a
better timbre is ever needed.
"""

from __future__ import annotations

import wave
from pathlib import Path
from typing import TYPE_CHECKING, Any

from teclario.domain.errors import TeclarioError

if TYPE_CHECKING:
    import numpy as np

_SAMPLE_RATE = 22050
_HARMONICS = (1.0, 0.5, 0.3, 0.15, 0.08)
_ATTACK_SECONDS = 0.005
_RELEASE_SECONDS = 0.12
_MAX_NOTE_SECONDS = 6.0  # piano strings die out; cap sustained notes
_PEAK = 0.9


class SynthesisError(TeclarioError):
    """The MIDI file could not be rendered."""


class AdditiveSynthesizer:
    def render(self, midi_path: Path, wav_path: Path) -> None:
        try:
            import numpy as np
            import pretty_midi

            midi = pretty_midi.PrettyMIDI(str(midi_path))
            notes = [n for inst in midi.instruments if not inst.is_drum for n in inst.notes]
            end = max((n.end for n in notes), default=0.0) + _RELEASE_SECONDS + 0.5
            mix = np.zeros(int(end * _SAMPLE_RATE) + 1, dtype=np.float64)
            for note in notes:
                _add_note(mix, note.start, note.end, note.pitch, note.velocity)
            peak = float(np.max(np.abs(mix))) if mix.size else 0.0
            if peak > 0:
                mix *= _PEAK / peak
            _write_wav(wav_path, mix)
        except Exception as exc:
            raise SynthesisError(f"synthesis failed: {type(exc).__name__}: {exc}") from exc


def _add_note(
    mix: np.ndarray[Any, Any], start: float, end: float, pitch: int, velocity: int
) -> None:
    import numpy as np

    duration = min(max(end - start, 0.05), _MAX_NOTE_SECONDS) + _RELEASE_SECONDS
    count = int(duration * _SAMPLE_RATE)
    t = np.arange(count) / _SAMPLE_RATE
    frequency = 440.0 * 2.0 ** ((pitch - 69) / 12.0)
    decay = 1.5 + (pitch - 21) * 0.04  # high notes fade faster
    tone = sum(
        weight * np.sin(2 * np.pi * frequency * (k + 1) * t)
        for k, weight in enumerate(_HARMONICS)
        if frequency * (k + 1) < _SAMPLE_RATE / 2
    )
    envelope = np.exp(-decay * t) * np.minimum(1.0, t / _ATTACK_SECONDS)
    held = max(end - start, 0.05)
    release = np.clip((held + _RELEASE_SECONDS - t) / _RELEASE_SECONDS, 0.0, 1.0)
    first = int(start * _SAMPLE_RATE)
    segment = tone * envelope * release * (velocity / 127.0)
    mix[first : first + count] += segment[: len(mix) - first]


def _write_wav(path: Path, samples: np.ndarray[Any, Any]) -> None:
    import numpy as np

    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(_SAMPLE_RATE)
        handle.writeframes(pcm.tobytes())
