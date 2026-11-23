"""Audio drawn from known notes with a few decaying harmonics, to test the octave check."""

from __future__ import annotations

import wave
from collections.abc import Sequence
from pathlib import Path

import numpy as np

from notacaida.domain.models import AudioFile
from notacaida.domain.notes import NoteEvent

RATE = 44100
HARMONICS = (1.0, 0.5, 0.3, 0.15, 0.08)  # a second harmonic half as strong, as on a piano


def tones(
    notes: Sequence[NoteEvent], path: Path, *, harmonics: Sequence[float] = HARMONICS
) -> AudioFile:
    """Write ``notes`` as a mono 16-bit WAV and return it as an ``AudioFile``."""
    end = max(n.end_s for n in notes) + 1.0
    mix = np.zeros(int(end * RATE), dtype=np.float64)
    for note in notes:
        count = int((min(note.end_s - note.start_s, 3.0) + 0.1) * RATE)
        t = np.arange(count) / RATE
        hertz = 440.0 * 2.0 ** ((note.pitch - 69) / 12.0)
        tone = sum(
            weight * np.sin(2 * np.pi * hertz * (k + 1) * t)
            for k, weight in enumerate(harmonics)
            if hertz * (k + 1) < RATE / 2
        )
        envelope = np.exp(-(1.5 + (note.pitch - 21) * 0.04) * t) * np.minimum(1.0, t / 0.005)
        first = int(note.start_s * RATE)
        segment = tone * envelope * (note.velocity / 127.0)
        mix[first : first + count] += segment[: mix.size - first]
    mix *= 0.9 / max(float(np.abs(mix).max()), 1e-9)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes((mix * 32767).astype("<i2").tobytes())
    return AudioFile(path, end)
