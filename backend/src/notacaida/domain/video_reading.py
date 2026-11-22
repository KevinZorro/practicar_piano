"""What reading the falling notes of a video produced (ADR 0023), however it was read."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from notacaida.domain.notes import NoteEvent
from notacaida.domain.quantize import Hand


class ReadingMethod(StrEnum):
    #: The strip just above the keyboard, where the bars land, unrolled into a timeline.
    BARS = "bars"
    #: The keys of the drawn keyboard that light up, frame by frame.
    KEYS = "keys"
    #: The notes of the lit keys with the finer timing of their bars.
    FUSED = "fused"


@dataclass(frozen=True, slots=True)
class NoteReading:
    method: ReadingMethod
    notes: tuple[NoteEvent, ...]
    #: Hand of each note from the colour of its bar, in the order of ``notes``; empty when the
    #: video does not draw the hands in two colours, None for a note whose colour was unclear.
    hands: tuple[Hand | None, ...] = ()


@dataclass(frozen=True, slots=True)
class VideoReading:
    """Notes read from a falling-notes video, or why the video could not be read."""

    failure: str | None
    #: Size and range of the drawn keyboard, e.g. "88 keys, A0-C8".
    keyboard: str | None = None
    fps: float = 0.0
    frames: int = 0
    frames_with_keyboard: int = 0
    fall_speed_px_s: float | None = None
    #: Whether the video lights the keys that sound (enables the KEYS and FUSED readings).
    lit_keys: bool = False
    readings: tuple[NoteReading, ...] = ()
    preferred: ReadingMethod | None = None

    @property
    def readable(self) -> bool:
        return self.failure is None and self.preferred is not None

    def reading(self, method: ReadingMethod) -> NoteReading | None:
        return next((r for r in self.readings if r.method is method), None)

    @property
    def preferred_reading(self) -> NoteReading | None:
        return self.reading(self.preferred) if self.preferred else None
