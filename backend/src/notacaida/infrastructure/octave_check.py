"""Which octave the keys of a drawn keyboard are in, from the sound of the song (ADR 0023).

A keyboard that is not a standard size has no octave of its own: the picture shows the keys,
not their numbers, so the reader centres it on middle C and may be one or two octaves off.
The sound settles it without a transcription model. A note really played at frequency f has
energy at f and almost none at f/2. Read an octave too high (candidate 2f), the real
fundamental sits at half the candidate, so there is as much energy below it as at it; read an
octave too low (candidate f/2), there is no energy at the candidate at all. So each read note
is scored by how much louder its candidate frequency is than half of it, and the shift with
the best average over the whole song wins.
"""

from __future__ import annotations

import math
import wave
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from notacaida.domain.errors import NotacaidaError
from notacaida.domain.models import AudioFile
from notacaida.domain.notes import NoteEvent
from notacaida.domain.video_reading import OctaveEstimate

LOWEST_PIANO_PITCH = 21  # A0
HIGHEST_PIANO_PITCH = 108  # C8

_SHIFTS = (-24, -12, 0, 12, 24)
_WINDOW = 8192  # samples: 0.19 s at 44.1 kHz, 5 Hz per bin
_SKIP_S = 0.03  # past the attack of the note
_MIN_NOTE_S = 0.12
_BAND = 0.03  # a frequency is the loudest bin within this share around it
_MIN_HZ = 24.0  # below this there is no energy to compare with: use the noise floor
_EPSILON = 1e-9
_MAX_NOTES = 400


class OctaveCheckError(NotacaidaError):
    """The audio could not be read for the octave check."""


class AudioOctaveEstimator:
    """Needs numpy (imported when used, like the rest of the video reading)."""

    def __init__(self, max_notes: int = _MAX_NOTES) -> None:
        self._max_notes = max_notes

    def estimate(self, notes: Sequence[NoteEvent], audio: AudioFile) -> OctaveEstimate | None:
        """None when no shift is possible (the notes already span the piano) or too few notes."""
        import numpy as np

        shifts = _possible_shifts(notes)
        chosen = _spread([n for n in notes if n.end_s - n.start_s >= _MIN_NOTE_S], self._max_notes)
        if len(shifts) < 2 or not chosen:
            return None
        samples, rate = _read_wav(audio.path)
        window = np.hanning(_WINDOW).astype(np.float32)
        scores: dict[int, list[float]] = {shift: [] for shift in shifts}
        for note in chosen:
            first = int((note.start_s + _SKIP_S) * rate)
            segment = samples[first : first + _WINDOW]
            if segment.size < _WINDOW // 2:
                continue
            spectrum = np.abs(np.fft.rfft(segment * window[: segment.size], n=_WINDOW))
            floor = float(np.median(spectrum))
            for shift in shifts:
                hertz = 440.0 * 2.0 ** ((note.pitch + shift - 69) / 12.0)
                below = hertz / 2 if hertz / 2 >= _MIN_HZ else None
                fundamental = _loudest(spectrum, hertz, rate)
                lower = floor if below is None else _loudest(spectrum, below, rate)
                scores[shift].append(
                    math.log10(fundamental + _EPSILON) - math.log10(lower + _EPSILON)
                )
        means = {s: sum(v) / len(v) for s, v in scores.items() if v}
        if len(means) < 2:
            return None
        ranked = sorted(means.items(), key=lambda pair: pair[1], reverse=True)
        (best, top), (_, second) = ranked[0], ranked[1]
        return OctaveEstimate(
            shift=best,
            margin=top - second,
            notes_used=len(scores[best]),
            scores=tuple(sorted(means.items())),
        )


def _possible_shifts(notes: Sequence[NoteEvent]) -> tuple[int, ...]:
    """The octave shifts that keep every note inside the 88 keys of a piano."""
    if not notes:
        return ()
    low, high = min(n.pitch for n in notes), max(n.pitch for n in notes)
    return tuple(
        s for s in _SHIFTS if low + s >= LOWEST_PIANO_PITCH and high + s <= HIGHEST_PIANO_PITCH
    )


def _spread(notes: list[NoteEvent], limit: int) -> list[NoteEvent]:
    """At most ``limit`` notes, evenly spread over the song (the same ones every time)."""
    if len(notes) <= limit:
        return notes
    ordered = sorted(notes, key=lambda n: n.start_s)
    return [ordered[i * len(ordered) // limit] for i in range(limit)]


def _loudest(spectrum: Any, hertz: float, rate: int) -> float:
    """The loudest bin around ``hertz`` (at least three bins wide, inside the spectrum)."""
    per_bin = rate / _WINDOW
    low = max(int(hertz * (1 - _BAND) / per_bin), 0)
    high = min(max(math.ceil(hertz * (1 + _BAND) / per_bin) + 1, low + 3), spectrum.size)
    return float(spectrum[low:high].max()) if high > low else 0.0


def _read_wav(path: Path) -> tuple[Any, int]:
    """Mono float samples and the sample rate of a 16-bit PCM WAV file."""
    import numpy as np

    try:
        with wave.open(str(path), "rb") as handle:
            if handle.getsampwidth() != 2:
                raise OctaveCheckError("only 16-bit WAV audio can be checked")
            rate, channels = handle.getframerate(), handle.getnchannels()
            raw = handle.readframes(handle.getnframes())
    except (OSError, wave.Error, EOFError) as exc:
        raise OctaveCheckError(f"could not read the audio: {type(exc).__name__}") from exc
    pcm = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        pcm = pcm[: pcm.size // channels * channels].reshape(-1, channels).mean(axis=1)
    return pcm, rate
