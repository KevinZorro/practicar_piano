"""In-memory adapters for the job repository and the result store (ADR 0016)."""

from __future__ import annotations

from datetime import datetime, timedelta

from teclario.application.ports import Clock
from teclario.domain.errors import JobNotFoundError, ResultNotReadyError
from teclario.domain.job import Job
from teclario.domain.result import SongResult


class InMemoryJobRepository:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}

    def add(self, job: Job) -> None:
        self._jobs[job.id] = job

    def get(self, job_id: str) -> Job:
        try:
            return self._jobs[job_id]
        except KeyError:
            raise JobNotFoundError("unknown job") from None

    def remove(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)

    def all(self) -> list[Job]:
        return list(self._jobs.values())


class TtlResultStore:
    """Keeps a result only until the client takes it, with a safety expiry.

    Nothing is persisted: a restart drops pending results and the client retries.
    """

    def __init__(self, clock: Clock, ttl_s: float = 6 * 3600) -> None:
        self._clock = clock
        self._ttl = timedelta(seconds=ttl_s)
        self._items: dict[str, tuple[datetime, SongResult]] = {}

    def put(self, job_id: str, result: SongResult) -> None:
        self._items[job_id] = (self._clock.now() + self._ttl, result)

    def take(self, job_id: str) -> SongResult:
        entry = self._items.get(job_id)
        if entry is None or entry[0] <= self._clock.now():
            self._items.pop(job_id, None)
            raise ResultNotReadyError("no result available")
        return entry[1]

    def discard(self, job_id: str) -> None:
        self._items.pop(job_id, None)

    def purge_expired(self) -> list[str]:
        """Drop expired results and return their job ids."""
        now = self._clock.now()
        expired = [job_id for job_id, (until, _) in self._items.items() if until <= now]
        for job_id in expired:
            del self._items[job_id]
        return expired

    def __len__(self) -> int:
        return len(self._items)
