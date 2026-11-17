from __future__ import annotations

import asyncio
import threading
from pathlib import Path

from pianola.application.job_queue import JobQueue, QueueLimits
from pianola.application.job_service import GetJobStatus, Sweep
from pianola.application.process_job import ProcessJob
from pianola.application.worker import Worker
from pianola.domain.job import Job, JobStatus
from pianola.domain.models import AudioFile, TranscriptionOutput
from pianola.domain.video_url import VideoUrl
from pianola.infrastructure.memory_stores import InMemoryJobRepository, TtlResultStore
from tests.support.fakes import FakeClock, FakeDownloader, FakeMidiReader, FakeScoreBuilder


class BlockingTranscriber:
    """Holds the worker thread until released, to prove the event loop stays free."""

    name = "blocking"

    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()

    def transcribe(self, audio: AudioFile, midi_path: Path) -> TranscriptionOutput:
        self.started.set()
        assert self.release.wait(timeout=5)
        midi_path.write_bytes(b"MThd")
        return TranscriptionOutput(1, 1.0)


def build(tmp_path: Path, transcriber: BlockingTranscriber) -> tuple[Worker, JobQueue, Env]:
    clock = FakeClock()
    repo = InMemoryJobRepository()
    results = TtlResultStore(clock)
    queue = JobQueue(repo, clock, QueueLimits())
    process = ProcessJob(
        downloader=FakeDownloader(),
        transcriber=transcriber,
        reader=FakeMidiReader(),
        repository=repo,
        results=results,
        clock=clock,
        score_builder=FakeScoreBuilder(),
        work_dir=tmp_path,
    )
    worker = Worker(queue, process, Sweep(repo, results, clock))
    return worker, queue, Env(repo, queue, clock)


class Env:
    def __init__(self, repo: InMemoryJobRepository, queue: JobQueue, clock: FakeClock) -> None:
        self.repo, self.queue, self.clock = repo, queue, clock

    def submit(self, job_id: str, ip: str) -> Job:
        job = Job(job_id, VideoUrl("dQw4w9WgXcQ"), ip, 100.0, self.clock.now())
        self.queue.submit(job)
        return job


def test_idle_worker_does_nothing(tmp_path: Path) -> None:
    worker, _, _ = build(tmp_path, BlockingTranscriber())
    assert asyncio.run(worker.run_next()) is False


def test_jobs_run_one_at_a_time_and_the_loop_stays_responsive(tmp_path: Path) -> None:
    transcriber = BlockingTranscriber()
    worker, queue, env = build(tmp_path, transcriber)
    first, second = env.submit("a", "ip1"), env.submit("b", "ip2")
    status = GetJobStatus(env.repo, queue)

    async def scenario() -> None:
        task = asyncio.create_task(worker.run_next())
        while not transcriber.started.is_set():
            await asyncio.sleep(0.005)
        # the worker thread is busy; the loop can still answer status queries
        assert status.execute("a").status is JobStatus.TRANSCRIBING
        view = status.execute("b")
        assert (view.status, view.position) == (JobStatus.QUEUED, 1)
        assert second.status is JobStatus.QUEUED  # not started in parallel
        transcriber.release.set()
        assert await task is True
        assert await worker.run_next() is True

    asyncio.run(scenario())
    assert (first.status, second.status) == (JobStatus.DONE, JobStatus.DONE)
    assert queue.position("b") is None


def test_worker_survives_a_failing_job_and_frees_the_slot(tmp_path: Path) -> None:
    transcriber = BlockingTranscriber()
    transcriber.release.set()
    worker, queue, env = build(tmp_path, transcriber)
    env.submit("a", "ip1")
    env.repo.get("a").video = None  # makes ProcessJob fail with internal_error
    env.submit("b", "ip2")

    async def scenario() -> None:
        assert await worker.run_next() is True
        assert await worker.run_next() is True

    asyncio.run(scenario())
    assert env.repo.get("a").status is JobStatus.FAILED
    assert env.repo.get("b").status is JobStatus.DONE
    assert queue.waiting_count() == 0
