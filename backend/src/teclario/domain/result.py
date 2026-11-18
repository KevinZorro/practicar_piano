"""What the client receives for a song: every difficulty level, ready to play."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from teclario.domain.notes import NoteEvent
from teclario.domain.polyphony import ReductionStats
from teclario.domain.score import Score

LevelName = Literal["original", "playable", "easy"]


@dataclass(frozen=True, slots=True)
class LevelResult:
    name: LevelName
    notes: tuple[NoteEvent, ...]
    stats: ReductionStats
    #: ``None`` for the original level: it is not meant to be read as sheet music.
    score: Score | None


@dataclass(frozen=True, slots=True)
class SongResult:
    """Every level is delivered at once because the server keeps nothing (ADR 0016)."""

    duration_s: float
    tempo_bpm: float
    tempo_confidence: Literal["high", "low"]
    levels: tuple[LevelResult, ...]
