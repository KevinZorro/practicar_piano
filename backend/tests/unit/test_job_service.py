import pytest

from pianola.application.job_queue import JobQueue, QueueLimits
from pianola.application.job_service import (
    TERMINAL_RETENTION,
    DeleteJob,
    FetchResult,
    GetJobStatus,
    Sweep,
)
from pianola.domain.errors import JobNotFoundError, ResultNotReadyError
from pianola.domain.job import Job, JobStatus
from pianola.domain.result import SongResult
from pianola.domain.video_url import VideoUrl
from pianola.infrastructure.memory_stores import InMemoryJobRepository, TtlResultStore
from tests.support.fakes import FakeClock

RESULT = SongResult(10.0, 120.0, "high", ())


class Env:
    def __init__(self) -> None:
        self.clock = FakeClock()
        self.repo = InMemoryJobRepository()
        self.results = TtlResultStore(self.clock, ttl_s=600)
        self.queue = JobQueue(self.repo, self.clock, QueueLimits())

    def job(self, job_id: str = "j", ip: str = "ip") -> Job:
        job = Job(job_id, VideoUrl("dQw4w9WgXcQ"), ip, 100.0, self.clock.now())
        self.queue.submit(job)
        return job

    def complete(self, job: Job) -> None:
        self.queue.next_job_id()
        for status in (JobStatus.DOWNLOADING, JobStatus.TRANSCRIBING, JobStatus.SCORING):
            job.transition_to(status, self.clock.now())
        self.results.put(job.id, RESULT)
        job.transition_to(JobStatus.DONE, self.clock.now())
        self.queue.finished(job.id)


def test_status_of_a_waiting_job_has_position_and_wait() -> None:
    env = Env()
    env.job("a")
    env.job("b", "ip2")
    view = GetJobStatus(env.repo, env.queue).execute("b")
    assert view.status is JobStatus.QUEUED
    assert view.position == 2
    assert view.estimated_wait_s is not None
    assert view.estimated_wait_s > 0


def test_status_of_unknown_job_raises() -> None:
    env = Env()
    with pytest.raises(JobNotFoundError):
        GetJobStatus(env.repo, env.queue).execute("nope")


def test_status_of_a_done_job_has_no_position() -> None:
    env = Env()
    env.complete(env.job())
    view = GetJobStatus(env.repo, env.queue).execute("j")
    assert (view.status, view.position, view.estimated_wait_s) == (JobStatus.DONE, None, None)


def test_fetch_requires_a_done_job() -> None:
    env = Env()
    env.job()
    with pytest.raises(ResultNotReadyError):
        FetchResult(env.repo, env.results).execute("j")


def test_fetch_is_repeatable_and_delete_ends_it() -> None:
    env = Env()
    env.complete(env.job())
    fetch = FetchResult(env.repo, env.results)
    assert fetch.execute("j") is RESULT
    assert fetch.execute("j") is RESULT
    DeleteJob(env.repo, env.results, env.queue).execute("j")
    with pytest.raises(JobNotFoundError):
        fetch.execute("j")
    assert len(env.results) == 0


def test_deleting_a_waiting_job_frees_its_place() -> None:
    env = Env()
    env.job("a")
    DeleteJob(env.repo, env.results, env.queue).execute("a")
    assert env.queue.waiting_count() == 0
    with pytest.raises(JobNotFoundError):
        DeleteJob(env.repo, env.results, env.queue).execute("a")


def test_sweep_expires_undelivered_results() -> None:
    env = Env()
    job = env.job()
    env.complete(job)
    env.clock.advance(601)
    Sweep(env.repo, env.results, env.clock).execute()
    assert job.status is JobStatus.EXPIRED
    with pytest.raises(ResultNotReadyError):
        FetchResult(env.repo, env.results).execute("j")


def test_sweep_removes_old_terminal_jobs_but_keeps_recent_ones() -> None:
    env = Env()
    failed = env.job("f")
    failed.transition_to(JobStatus.FAILED, env.clock.now(), "download_failed")
    sweep = Sweep(env.repo, env.results, env.clock)
    sweep.execute()
    assert env.repo.get("f") is failed
    env.clock.advance(TERMINAL_RETENTION.total_seconds())
    sweep.execute()
    with pytest.raises(JobNotFoundError):
        env.repo.get("f")


def test_sweep_ignores_leftover_results_of_deleted_jobs() -> None:
    env = Env()
    env.results.put("ghost", RESULT)
    env.clock.advance(601)
    Sweep(env.repo, env.results, env.clock).execute()
    assert len(env.results) == 0
