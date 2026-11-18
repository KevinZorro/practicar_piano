"""Plain data carried through the Phase 0 benchmark."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from notacaida.domain.video_url import VideoUrl


@dataclass(frozen=True, slots=True)
class LocalAudio:
    """An audio file the user already has (the study's fallback when YouTube blocks the VPS)."""

    path: Path

    @property
    def fingerprint(self) -> str:
        """Short hash of the file name, safe for logs and output folder names."""
        return hashlib.sha256(self.path.name.encode()).hexdigest()[:10]

    def __repr__(self) -> str:
        return f"LocalAudio(fingerprint={self.fingerprint!r})"


SongSource = VideoUrl | LocalAudio


@dataclass(frozen=True, slots=True)
class AudioFile:
    path: Path
    duration_seconds: float


@dataclass(frozen=True, slots=True)
class ResourceUsage:
    """Cost of running one model on one song, measured in an isolated process."""

    wall_seconds: float
    peak_rss_mb: float


@dataclass(frozen=True, slots=True)
class TranscriptionOutput:
    """What a transcriber reports about its own work."""

    note_count: int
    inference_seconds: float


@dataclass(frozen=True, slots=True)
class ModelRun:
    model_name: str
    midi_path: Path | None = None
    wav_path: Path | None = None
    note_count: int | None = None
    inference_seconds: float | None = None
    usage: ResourceUsage | None = None
    error: str | None = None

    @property
    def succeeded(self) -> bool:
        return self.error is None and self.midi_path is not None


@dataclass(frozen=True, slots=True)
class SongResult:
    index: int
    label: str
    fingerprint: str
    duration_seconds: float | None = None
    download_seconds: float | None = None
    download_error: str | None = None
    runs: tuple[ModelRun, ...] = field(default_factory=tuple)

    @property
    def downloaded(self) -> bool:
        return self.download_error is None and self.duration_seconds is not None

    def run_for(self, model_name: str) -> ModelRun | None:
        return next((run for run in self.runs if run.model_name == model_name), None)
