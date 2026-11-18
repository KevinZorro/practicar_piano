"""Read and delivery use cases, plus the periodic cleanup."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from notacaida.application.job_queue import JobQueue
from notacaida.application.ports import Clock, JobRepository, ResultStore
from notacaida.domain.errors import JobNotFoundError, ResultNotReadyError
from notacaida.domain.job import JobStatus
from notacaida.domain.result import SongResult

TERMINAL_RETENTION = timedelta(hours=1)


@dataclass(frozen=True, slots=True)
class JobView:
    status: JobStatus
    duration_s: float
    position: int | None
    estimated_wait_s: float | None
    error_code: str | None


class GetJobStatus:
    def __init__(self, repository: JobRepository, queue: JobQueue) -> None:
        self._repository = repository
        self._queue = queue

    def execute(self, job_id: str) -> JobView:
        job = self._repository.get(job_id)
        place = self._queue.position(job_id) if job.status is JobStatus.QUEUED else None
        return JobView(
            status=job.status,
            duration_s=job.duration_s,
            position=place.position if place else None,
            estimated_wait_s=place.estimated_wait_s if place else None,
            error_code=job.error_code,
        )


class FetchResult:
    """Returns the result without deleting it, so a lost response can be retried."""

    def __init__(self, repository: JobRepository, results: ResultStore) -> None:
        self._repository = repository
        self._results = results

    def execute(self, job_id: str) -> SongResult:
        job = self._repository.get(job_id)
        if job.status is not JobStatus.DONE:
            raise ResultNotReadyError(job.status.value)
        return self._results.take(job_id)


class DeleteJob:
    """The client confirms delivery (or gives up): result and job disappear."""

    def __init__(self, repository: JobRepository, results: ResultStore, queue: JobQueue) -> None:
        self._repository = repository
        self._results = results
        self._queue = queue

    def execute(self, job_id: str) -> None:
        self._repository.get(job_id)  # raises JobNotFoundError for unknown jobs
        self._queue.cancel(job_id)
        self._results.discard(job_id)
        self._repository.remove(job_id)
        # A running job that is deleted finishes anyway; its leftover result is purged by
        # the safety expiry.


class Sweep:
    """Expire undelivered results and drop old terminal jobs. Run periodically."""

    def __init__(self, repository: JobRepository, results: ResultStore, clock: Clock) -> None:
        self._repository = repository
        self._results = results
        self._clock = clock

    def execute(self) -> None:
        now = self._clock.now()
        for job_id in self._results.purge_expired():
            try:
                job = self._repository.get(job_id)
            except JobNotFoundError:
                continue  # the client deleted the job; only the result was left behind
            if job.status is JobStatus.DONE:
                job.transition_to(JobStatus.EXPIRED, now)
        for job in self._repository.all():
            terminal = job.status in (JobStatus.FAILED, JobStatus.EXPIRED)
            if terminal and now - job.updated_at >= TERMINAL_RETENTION:
                self._repository.remove(job.id)
