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


@dataclass(frozen=True, slots=True)
class NoteReading:
    method: ReadingMethod
    notes: tuple[NoteEvent, ...]
    #: Hand of each note from the colour of its bar, in the order of ``notes``; empty when the
    #: video does not draw the hands in two colours, None for a note whose colour was unclear.
    hands: tuple[Hand | None, ...] = ()


@dataclass(frozen=True, slots=True)
class OctaveEstimate:
    """Which octave shift makes the notes read from a video sound like its audio."""

    #: Semitones (a multiple of 12) to add to the pitches that were read.
    shift: int
    #: How much better the best shift scored than the runner-up (log10 units).
    margin: float
    notes_used: int
    #: (shift, average score) of every shift that could be tried.
    scores: tuple[tuple[int, float], ...] = ()


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
    #: Whether the video lights the keys that sound (enables the KEYS reading).
    lit_keys: bool = False
    #: F1 (onsets within 100 ms) of the bars against the lit keys once their delay is removed.
    bar_key_agreement: float | None = None
    #: How much later (+) or earlier (-) the bars land than their keys light up, in seconds.
    bar_delay_s: float | None = None
    readings: tuple[NoteReading, ...] = ()
    preferred: ReadingMethod | None = None
    #: The lit keys agree with the bars (an independent reading of the same notes), so the
    #: reading can be trusted without a transcription of the audio to check it against.
    confirmed: bool = False
    #: The keyboard is not a standard size: which octave its keys are in is a guess.
    octave_guessed: bool = False
    #: Readings that were made but not trusted, kept so the report can measure them anyway.
    discarded: tuple[NoteReading, ...] = ()
    #: Semitones the pitches were moved after hearing the song (the octave was a guess).
    octave_shift: int = 0

    @property
    def readable(self) -> bool:
        return self.failure is None and self.preferred is not None

    def reading(self, method: ReadingMethod) -> NoteReading | None:
        return next((r for r in self.readings if r.method is method), None)

    @property
    def preferred_reading(self) -> NoteReading | None:
        return self.reading(self.preferred) if self.preferred else None
