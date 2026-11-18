"""Score output: MusicXML text plus the map that ties measures to seconds of the video."""

from __future__ import annotations

from dataclasses import dataclass

from teclario.domain.quantize import CELLS_PER_MEASURE, QuantizedPiece


@dataclass(frozen=True, slots=True)
class MeasureTime:
    measure: int  # 1-based, as in MusicXML
    start_s: float


@dataclass(frozen=True, slots=True)
class Score:
    musicxml: str
    timemap: tuple[MeasureTime, ...]
    tempo_bpm: float


def build_timemap(piece: QuantizedPiece) -> tuple[MeasureTime, ...]:
    """Start time of every measure, so the browser can move the cursor with the video."""
    return tuple(
        MeasureTime(measure=m + 1, start_s=piece.time_of(m * CELLS_PER_MEASURE))
        for m in range(piece.measure_count)
    )
