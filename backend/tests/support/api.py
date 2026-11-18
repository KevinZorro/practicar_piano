"""Builds the API with in-memory adapters and fakes (no network, no models)."""

from __future__ import annotations

import asyncio
import itertools
from dataclasses import dataclass
from pathlib import Path

from fastapi.testclient import TestClient

from pianola.api.app import create_app
from pianola.api.container import Container
from pianola.application.job_queue import JobQueue, QueueLimits
from pianola.application.job_service import DeleteJob, FetchResult, GetJobStatus, Sweep
from pianola.application.process_job import ProcessJob
from pianola.application.submit_job import SubmitJob
from pianola.application.worker import Worker
from pianola.domain.notes import NoteEvent
from pianola.infrastructure.memory_stores import InMemoryJobRepository, TtlResultStore
from tests.support.fakes import (
    FakeClock,
    FakeDownloader,
    FakeMidiReader,
    FakeProbe,
    FakeScoreBuilder,
    FakeTranscriber,
)

GOOD_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
GOOD_ID = "dQw4w9WgXcQ"


@dataclass
class ApiEnv:
    client: TestClient
    container: Container
    worker: Worker
    clock: FakeClock

    def process_next(self) -> bool:
        return asyncio.run(self.worker.run_next())


def build_api(
    tmp_path: Path,
    *,
    limits: QueueLimits | None = None,
    probe: FakeProbe | None = None,
    downloader: FakeDownloader | None = None,
    run_worker: bool = False,
    trust_proxy: bool = False,
    blocked: frozenset[str] = frozenset(),
) -> ApiEnv:
    clock = FakeClock()
    repo = InMemoryJobRepository()
    results = TtlResultStore(clock)
    queue = JobQueue(repo, clock, limits or QueueLimits())
    ids = itertools.count(1)
    process = ProcessJob(
        downloader=downloader or FakeDownloader(),
        transcriber=FakeTranscriber("fake"),
        reader=FakeMidiReader((NoteEvent(60, 0.0, 1.0, 80), NoteEvent(64, 1.0, 2.0, 70))),
        repository=repo,
        results=results,
        clock=clock,
        score_builder=FakeScoreBuilder(),
        work_dir=tmp_path,
    )
    worker = Worker(queue, process, Sweep(repo, results, clock), idle_poll_s=0.01)
    container = Container(
        submit=SubmitJob(
            probe=probe or FakeProbe(200.0),
            queue=queue,
            clock=clock,
            new_id=lambda: f"job{next(ids)}",
            blocked_video_ids=blocked,
        ),
        status=GetJobStatus(repo, queue),
        fetch=FetchResult(repo, results),
        delete=DeleteJob(repo, results, queue),
        worker=worker if run_worker else None,
        trust_proxy=trust_proxy,
        sse_poll_s=0.01,
        sse_heartbeat_s=0.05,
    )
    client = TestClient(create_app(container), raise_server_exceptions=False)
    return ApiEnv(client, container, worker, clock)
