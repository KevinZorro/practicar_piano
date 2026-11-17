"""Use case: run one job from download to a result ready for the client."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from pianola.application.build_result import BuildResult
from pianola.application.ports import (
    AudioDownloader,
    Clock,
    JobRepository,
    MidiNoteReader,
    ResultStore,
    ScoreBuilder,
    Transcriber,
)
from pianola.domain.errors import PianolaError
from pianola.domain.job import Job, JobStatus
from pianola.domain.notes import Transcription

logger = logging.getLogger(__name__)


class ProcessJob:
    def __init__(
        self,
        *,
        downloader: AudioDownloader,
        transcriber: Transcriber,
        reader: MidiNoteReader,
        repository: JobRepository,
        results: ResultStore,
        clock: Clock,
        score_builder: ScoreBuilder,
        work_dir: Path | None = None,
    ) -> None:
        self._downloader = downloader
        self._transcriber = transcriber
        self._reader = reader
        self._repository = repository
        self._results = results
        self._clock = clock
        self._build = BuildResult(score_builder)
        self._work_dir = work_dir

    def execute(self, job_id: str) -> None:
        """Process a queued job. Never raises: failures end in ``FAILED`` with a stable code.

        The audio lives in a temporary directory that is deleted whatever happens.
        """
        job = self._repository.get(job_id)
        try:
            with tempfile.TemporaryDirectory(prefix="pianola-", dir=self._work_dir) as tmp:
                transcription = self._run(job, Path(tmp))
            self._advance(job, JobStatus.SCORING)
            self._results.put(job.id, self._build.execute(transcription))
            self._advance(job, JobStatus.DONE)
        except PianolaError as exc:
            self._fail(job, exc.code, type(exc).__name__)
        except Exception as exc:
            # Unexpected: log only the type, library messages may carry the link.
            self._fail(job, "internal_error", type(exc).__name__)

    def _run(self, job: Job, tmp: Path) -> Transcription:
        video = job.video
        if video is None:
            raise PianolaError("job has no source")
        self._advance(job, JobStatus.DOWNLOADING)
        audio = self._downloader.download(video, tmp)
        self._advance(job, JobStatus.TRANSCRIBING)
        midi_path = tmp / "transcription.mid"
        self._transcriber.transcribe(audio, midi_path)
        notes = self._reader.read(midi_path)
        return Transcription(notes=notes, duration_s=audio.duration_seconds)

    def _advance(self, job: Job, status: JobStatus) -> None:
        job.transition_to(status, self._clock.now())

    def _fail(self, job: Job, code: str, error_type: str) -> None:
        logger.warning("job failed: code=%s error=%s", code, error_type)
        if job.is_active:
            job.transition_to(JobStatus.FAILED, self._clock.now(), code)
