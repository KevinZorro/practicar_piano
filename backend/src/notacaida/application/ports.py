"""Ports: what the use cases need from the outside world.

Adapters live in ``notacaida.infrastructure``. Swapping yt-dlp, a model or the proxy
means writing a new adapter, never touching the domain or the use cases.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Generic, Protocol, TypeVar

from notacaida.domain.job import Job
from notacaida.domain.models import (
    AudioFile,
    ResourceUsage,
    SongSource,
    TranscriptionOutput,
    VideoFile,
)
from notacaida.domain.notes import NoteEvent
from notacaida.domain.quantize import QuantizedPiece
from notacaida.domain.result import SongResult
from notacaida.domain.score import Score
from notacaida.domain.video_reading import VideoReading
from notacaida.domain.video_url import VideoUrl

T = TypeVar("T")


class AudioDownloader(Protocol):
    def download(self, source: SongSource, dest_dir: Path) -> AudioFile:
        """Get only the audio of ``source`` into ``dest_dir`` (a copy the caller may delete).

        Raises ``DownloadError`` on failure and ``DurationLimitExceededError`` when
        the video is longer than the adapter's configured limit.
        """


class Transcriber(Protocol):
    @property
    def name(self) -> str: ...

    def transcribe(self, audio: AudioFile, midi_path: Path) -> TranscriptionOutput:
        """Write a MIDI file and report note count and inference time.

        Must be picklable (the meter may run it in a child process).
        Raises ``TranscriptionError`` on failure.
        """


class Synthesizer(Protocol):
    def render(self, midi_path: Path, wav_path: Path) -> None:
        """Render a listenable WAV from a MIDI file."""


@dataclass(frozen=True, slots=True)
class Measured(Generic[T]):
    value: T
    usage: ResourceUsage


class ResourceMeter(Protocol):
    def measure(self, work: Callable[[], T]) -> Measured[T]:
        """Run ``work`` and report wall time and peak memory.

        ``work`` must be picklable when the meter isolates it in a subprocess.
        Raises ``TranscriptionError`` if ``work`` fails.
        """


class Clock(Protocol):
    def now(self) -> datetime:
        """Current time, timezone-aware (UTC)."""


class DurationProbe(Protocol):
    def probe(self, video: VideoUrl) -> float:
        """Duration in seconds, read from metadata without downloading the audio.

        Raises ``DownloadError`` when the video cannot be queried.
        """


class MidiNoteReader(Protocol):
    def read(self, midi_path: Path) -> tuple[NoteEvent, ...]:
        """Parse the notes of a MIDI file written by a ``Transcriber``."""


class JobRepository(Protocol):
    def add(self, job: Job) -> None: ...

    def get(self, job_id: str) -> Job:
        """Raises ``JobNotFoundError``."""

    def remove(self, job_id: str) -> None: ...

    def all(self) -> list[Job]: ...


class ResultStore(Protocol):
    """Holds a finished transcription only until the client takes it (ADR 0016)."""

    def put(self, job_id: str, result: SongResult) -> None: ...

    def take(self, job_id: str) -> SongResult:
        """Return the result. Raises ``ResultNotReadyError`` when absent or expired."""

    def discard(self, job_id: str) -> None: ...

    def purge_expired(self) -> list[str]:
        """Drop results past their safety expiry and return their job ids."""


class ScoreBuilder(Protocol):
    def build(self, piece: QuantizedPiece) -> Score:
        """Render quantized notes as MusicXML with the measure-to-seconds map."""


@dataclass(frozen=True, slots=True)
class SongMedia:
    """Picture and sound of one song, for the video reading benchmark (ADR 0023)."""

    video: VideoFile
    audio: AudioFile | None
    #: The notes the video was drawn from, when known (synthetic test videos only).
    truth: tuple[NoteEvent, ...] | None = None


class SongMediaSource(Protocol):
    def fetch(self, source: SongSource, dest_dir: Path) -> SongMedia:
        """Get the video (and its sound, when there is one) into ``dest_dir``.

        Raises ``DownloadError`` or ``DurationLimitExceededError`` like ``AudioDownloader``.
        """


class VideoNoteReader(Protocol):
    def read(self, video: VideoFile, debug_dir: Path | None = None) -> VideoReading:
        """Read the falling notes drawn in ``video``; may write check images to ``debug_dir``.

        Must be picklable (the meter may run it in a child process). Raises
        ``VideoReadError`` when the file cannot be decoded; a video without a drawn keyboard
        is not an error but a reading with ``failure`` set.
        """


class MidiNoteWriter(Protocol):
    def write(self, notes: Sequence[NoteEvent], midi_path: Path) -> None: ...


class RollPlotter(Protocol):
    def plot(
        self,
        path: Path,
        reference: Sequence[NoteEvent],
        estimate: Sequence[NoteEvent],
        seconds: float,
    ) -> None:
        """Draw both note lists as one piano roll image, for a person to compare."""
