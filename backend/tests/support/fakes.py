"""Test doubles for the ports (no network, no models)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TypeVar

from pianola.application.ports import Measured
from pianola.domain.errors import (
    DownloadError,
    JobNotFoundError,
    ResultNotReadyError,
    TranscriptionError,
)
from pianola.domain.job import Job
from pianola.domain.models import AudioFile, ResourceUsage, SongSource, TranscriptionOutput
from pianola.domain.notes import NoteEvent
from pianola.domain.quantize import QuantizedPiece
from pianola.domain.result import SongResult
from pianola.domain.score import Score
from pianola.domain.video_url import VideoUrl

T = TypeVar("T")


class FakeDownloader:
    def __init__(
        self,
        durations: dict[str, float] | None = None,
        failing_ids: frozenset[str] = frozenset(),
    ) -> None:
        self._durations = durations or {}
        self._failing_ids = failing_ids
        self.downloaded: list[Path] = []

    def download(self, source: SongSource, dest_dir: Path) -> AudioFile:
        key = source.video_id if isinstance(source, VideoUrl) else source.path.stem
        if key in self._failing_ids:
            raise DownloadError("blocked by fake")
        path = dest_dir / "audio.m4a"
        path.write_bytes(b"fake-audio")
        self.downloaded.append(path)
        return AudioFile(path=path, duration_seconds=self._durations.get(key, 180.0))


class FakeTranscriber:
    def __init__(self, name: str, *, fails: bool = False, notes: int = 100) -> None:
        self._name = name
        self._fails = fails
        self._notes = notes
        self.audio_seen: list[Path] = []

    @property
    def name(self) -> str:
        return self._name

    def transcribe(self, audio: AudioFile, midi_path: Path) -> TranscriptionOutput:
        self.audio_seen.append(audio.path)
        if self._fails:
            raise TranscriptionError("model exploded")
        midi_path.write_bytes(b"MThd")
        return TranscriptionOutput(note_count=self._notes, inference_seconds=30.0)


class FakeSynthesizer:
    def __init__(self) -> None:
        self.rendered: list[Path] = []

    def render(self, midi_path: Path, wav_path: Path) -> None:
        wav_path.write_bytes(b"RIFF")
        self.rendered.append(wav_path)


class InlineMeter:
    """Runs the work in-process and reports a fixed cost."""

    def __init__(self, usage: ResourceUsage = ResourceUsage(45.0, 900.0)) -> None:  # noqa: B008
        self._usage = usage

    def measure(self, work: Callable[[], T]) -> Measured[T]:
        return Measured(value=work(), usage=self._usage)


class FakeClock:
    def __init__(self, start: datetime | None = None) -> None:
        self._now = start or datetime(2026, 11, 17, 12, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += timedelta(seconds=seconds)


class FakeProbe:
    def __init__(self, duration_s: float = 200.0, *, fails: bool = False) -> None:
        self._duration_s = duration_s
        self._fails = fails

    def probe(self, video: VideoUrl) -> float:
        if self._fails:
            raise DownloadError("probe failed")
        return self._duration_s


class FakeMidiReader:
    def __init__(self, notes: tuple[NoteEvent, ...] = (NoteEvent(60, 0.0, 1.0, 80),)) -> None:
        self._notes = notes

    def read(self, midi_path: Path) -> tuple[NoteEvent, ...]:
        assert midi_path.exists()
        return self._notes


class DictJobRepository:
    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}

    def add(self, job: Job) -> None:
        self.jobs[job.id] = job

    def get(self, job_id: str) -> Job:
        try:
            return self.jobs[job_id]
        except KeyError:
            raise JobNotFoundError(job_id) from None

    def remove(self, job_id: str) -> None:
        self.jobs.pop(job_id, None)

    def all(self) -> list[Job]:
        return list(self.jobs.values())


class DictResultStore:
    def __init__(self, *, fails: bool = False) -> None:
        self.items: dict[str, SongResult] = {}
        self._fails = fails

    def put(self, job_id: str, result: SongResult) -> None:
        if self._fails:
            raise OSError("disk full")
        self.items[job_id] = result

    def take(self, job_id: str) -> SongResult:
        try:
            return self.items[job_id]
        except KeyError:
            raise ResultNotReadyError(job_id) from None

    def discard(self, job_id: str) -> None:
        self.items.pop(job_id, None)

    def purge_expired(self) -> list[str]:
        return []


class FakeScoreBuilder:
    def build(self, piece: QuantizedPiece) -> Score:
        return Score(musicxml="<score-partwise/>", timemap=(), tempo_bpm=piece.tempo_bpm)
