"""Transcribed notes, independent of any model or file format."""

from __future__ import annotations

from dataclasses import dataclass

from pianola.domain.errors import DurationLimitExceededError


@dataclass(frozen=True, slots=True)
class NoteEvent:
    pitch: int
    start_s: float
    end_s: float
    velocity: int


@dataclass(frozen=True, slots=True)
class Transcription:
    notes: tuple[NoteEvent, ...]
    duration_s: float


@dataclass(frozen=True, slots=True)
class DurationPolicy:
    """Longest song the service accepts (ADR 0016: 10 minutes)."""

    max_seconds: float = 600.0

    def check(self, duration_s: float) -> None:
        if duration_s <= 0 or duration_s > self.max_seconds:
            raise DurationLimitExceededError(
                f"duration {duration_s:.0f}s outside (0, {self.max_seconds:.0f}]s"
            )
