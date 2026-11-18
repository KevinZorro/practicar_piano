"""Composition root of the service: the only place that picks the real adapters.

Run with ``uvicorn notacaida.api.wiring:create_production_app --factory``.
"""

from __future__ import annotations

import os
import secrets
from collections.abc import Mapping
from typing import Protocol

from fastapi import FastAPI

from notacaida.api.app import create_app
from notacaida.api.container import Container
from notacaida.api.log_redaction import install_log_redaction
from notacaida.api.settings import Settings
from notacaida.application.job_queue import JobQueue, QueueLimits
from notacaida.application.job_service import DeleteJob, FetchResult, GetJobStatus, Sweep
from notacaida.application.ports import AudioDownloader, DurationProbe, Transcriber
from notacaida.application.process_job import ProcessJob
from notacaida.application.submit_job import SubmitJob
from notacaida.application.worker import Worker
from notacaida.domain.notes import DurationPolicy
from notacaida.infrastructure.bytedance_transcriber import ByteDanceTranscriber
from notacaida.infrastructure.memory_stores import InMemoryJobRepository, TtlResultStore
from notacaida.infrastructure.midi_reader import PrettyMidiReader
from notacaida.infrastructure.music21_score import Music21ScoreBuilder
from notacaida.infrastructure.system_clock import SystemClock
from notacaida.infrastructure.ytdlp_downloader import YtDlpDownloader


class SourceAdapter(AudioDownloader, DurationProbe, Protocol):
    """What the service needs from the video source: a duration check and the audio."""


def build_container(
    settings: Settings,
    *,
    source: SourceAdapter | None = None,
    transcriber: Transcriber | None = None,
) -> Container:
    """Wires the service. ``source`` and ``transcriber`` exist so the end-to-end test can run
    the real pipeline offline; production leaves them out."""
    clock = SystemClock()
    repository = InMemoryJobRepository()
    results = TtlResultStore(clock)
    queue = JobQueue(repository, clock, QueueLimits())
    downloader = source or YtDlpDownloader(
        max_duration_seconds=settings.max_duration_s, proxy_url=settings.proxy_url
    )
    process = ProcessJob(
        downloader=downloader,
        transcriber=transcriber or ByteDanceTranscriber(settings.checkpoint_path, settings.device),
        reader=PrettyMidiReader(),
        repository=repository,
        results=results,
        clock=clock,
        score_builder=Music21ScoreBuilder(),
        work_dir=settings.work_dir,
    )
    return Container(
        submit=SubmitJob(
            probe=downloader,
            queue=queue,
            clock=clock,
            new_id=lambda: secrets.token_urlsafe(16),
            policy=DurationPolicy(settings.max_duration_s),
            blocked_video_ids=settings.blocked_video_ids,
        ),
        status=GetJobStatus(repository, queue),
        fetch=FetchResult(repository, results),
        delete=DeleteJob(repository, results, queue),
        worker=Worker(queue, process, Sweep(repository, results, clock)),
        trust_proxy=settings.trust_proxy,
    )


def create_production_app(env: Mapping[str, str] | None = None) -> FastAPI:
    install_log_redaction()
    settings = Settings.from_env(os.environ if env is None else env)
    if settings.work_dir:
        settings.work_dir.mkdir(parents=True, exist_ok=True)
    return create_app(build_container(settings))
