"""Ports: what the use cases need from the outside world.

Adapters live in ``pianola.infrastructure``. Swapping yt-dlp, a model or the proxy
means writing a new adapter, never touching the domain or the use cases.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Generic, Protocol, TypeVar

from pianola.domain.models import AudioFile, ResourceUsage, TranscriptionOutput
from pianola.domain.video_url import VideoUrl

T = TypeVar("T")


class AudioDownloader(Protocol):
    def download(self, url: VideoUrl, dest_dir: Path) -> AudioFile:
        """Download only the audio into ``dest_dir``.

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
