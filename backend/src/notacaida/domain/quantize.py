"""Quantization of note times onto a musical grid, and hand assignment (ADR 0018, D-08, D-09).

Time is counted in cells of one twelfth of a beat: 12 is the smallest number that holds both
straight sixteenths (3 cells) and eighth-note triplets (4 cells). Each beat picks the grid
that fits its onsets better, so a piece can mix straight and triplet beats.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import StrEnum

from notacaida.domain.notes import NoteEvent
from notacaida.domain.tempo import TempoEstimate

CELLS_PER_BEAT = 12
BEATS_PER_MEASURE = 4  # 4/4 is assumed: the time signature is not estimated in the MVP
CELLS_PER_MEASURE = CELLS_PER_BEAT * BEATS_PER_MEASURE
_STRAIGHT = 3  # sixteenth
_TRIPLET = 4  # eighth-note triplet
MIDDLE_C = 60


class Hand(StrEnum):
    LEFT = "left"
    RIGHT = "right"


@dataclass(frozen=True, slots=True)
class QuantNote:
    pitch: int
    start: int
    length: int
    velocity: int
    hand: Hand


@dataclass(frozen=True, slots=True)
class QuantizedPiece:
    notes: tuple[QuantNote, ...]
    tempo_bpm: float
    #: Time in seconds of cell 0 (the first beat of the first measure).
    origin_s: float

    @property
    def cell_s(self) -> float:
        return 60.0 / self.tempo_bpm / CELLS_PER_BEAT

    def time_of(self, cell: int) -> float:
        return self.origin_s + cell * self.cell_s

    @property
    def measure_count(self) -> int:
        if not self.notes:
            return 0
        end = max(n.start + n.length for n in self.notes)
        return math.ceil(end / CELLS_PER_MEASURE)


def assign_hand(pitch: int) -> Hand:
    """D-08: from middle C up is the right hand, below it the left."""
    return Hand.RIGHT if pitch >= MIDDLE_C else Hand.LEFT


def quantize(
    notes: tuple[NoteEvent, ...] | list[NoteEvent], tempo: TempoEstimate
) -> QuantizedPiece:
    if not notes:
        return QuantizedPiece((), tempo.bpm, 0.0)
    ordered = sorted(notes, key=lambda n: (n.start_s, n.pitch))
    cell_s = tempo.beat_s / CELLS_PER_BEAT
    grid_s = tempo.grid_s
    # beat 1 is the sixteenth-grid line nearest the first onset
    first = ordered[0].start_s
    origin_s = tempo.grid_offset_s + round((first - tempo.grid_offset_s) / grid_s) * grid_s

    raw_start = [(n.start_s - origin_s) / cell_s for n in ordered]
    raw_end = [(n.end_s - origin_s) / cell_s for n in ordered]
    grid_of_beat = _choose_grids(raw_start)

    quantized: dict[tuple[int, int], QuantNote] = {}
    for note, start_f, end_f in zip(ordered, raw_start, raw_end, strict=True):
        start = max(0, _snap(start_f, grid_of_beat))
        end = _snap(end_f, grid_of_beat)
        step = grid_of_beat.get(start // CELLS_PER_BEAT, _STRAIGHT)
        length = max(end - start, step)
        candidate = QuantNote(note.pitch, start, length, note.velocity, assign_hand(note.pitch))
        key = (candidate.pitch, candidate.start)
        previous = quantized.get(key)
        if previous is None or candidate.length > previous.length:
            quantized[key] = candidate  # one key struck twice in a cell is one note
    result = tuple(sorted(quantized.values(), key=lambda n: (n.start, n.pitch)))
    return QuantizedPiece(result, tempo.bpm, origin_s)


def _choose_grids(starts: list[float]) -> dict[int, int]:
    """Per beat, the grid step (3 straight, 4 triplet) whose lines are closest to its onsets."""
    by_beat: dict[int, list[float]] = {}
    for position in starts:
        beat = max(0, math.floor(position / CELLS_PER_BEAT))
        by_beat.setdefault(beat, []).append(position - beat * CELLS_PER_BEAT)
    chosen: dict[int, int] = {}
    for beat, offsets in by_beat.items():
        straight_error = sum(_distance(o, _STRAIGHT) for o in offsets)
        triplet_error = sum(_distance(o, _TRIPLET) for o in offsets)
        # Straight wins ties and near-ties: triplets must fit clearly better.
        chosen[beat] = _TRIPLET if triplet_error < 0.7 * straight_error else _STRAIGHT
    return chosen


def _distance(offset: float, step: int) -> float:
    return abs(offset - round(offset / step) * step)


def _snap(position: float, grid_of_beat: dict[int, int]) -> int:
    beat = max(0, math.floor(position / CELLS_PER_BEAT))
    step = grid_of_beat.get(beat, _STRAIGHT)
    return round(position / step) * step
