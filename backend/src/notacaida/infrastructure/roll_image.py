"""Piano roll image comparing two transcriptions, for a person to check by eye."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np

from notacaida.domain.keyboard import HIGHEST_PIANO_PITCH, LOWEST_PIANO_PITCH
from notacaida.domain.notes import NoteEvent
from notacaida.infrastructure.png import write_png

_PX_PER_S = 50
_PX_PER_KEY = 4


class PngRollPlotter:
    """Reference in red, estimate in green: where they agree the note shows yellow."""

    def plot(
        self,
        path: Path,
        reference: Sequence[NoteEvent],
        estimate: Sequence[NoteEvent],
        seconds: float,
    ) -> None:
        keys = HIGHEST_PIANO_PITCH - LOWEST_PIANO_PITCH + 1
        image = np.full((keys * _PX_PER_KEY, round(seconds * _PX_PER_S), 3), 24, np.uint8)
        for octave_c in range(24, HIGHEST_PIANO_PITCH + 1, 12):  # a faint line at every C
            image[self._row(octave_c) + _PX_PER_KEY - 1, :] = 48
        for notes, channel in ((reference, 0), (estimate, 1)):
            for note in notes:
                if not LOWEST_PIANO_PITCH <= note.pitch <= HIGHEST_PIANO_PITCH:
                    continue
                start, end = round(note.start_s * _PX_PER_S), round(note.end_s * _PX_PER_S)
                if start >= image.shape[1]:
                    continue
                row = self._row(note.pitch)
                image[row : row + _PX_PER_KEY - 1, start : max(start + 1, end), channel] = 230
        write_png(path, image)

    @staticmethod
    def _row(pitch: int) -> int:
        return (HIGHEST_PIANO_PITCH - pitch) * _PX_PER_KEY
