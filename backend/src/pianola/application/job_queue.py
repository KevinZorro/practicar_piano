"""In-memory job queue: one worker, bounded size, per-IP limits (ADR 0016)."""

from __future__ import annotations

from collections import defaultdict, deque
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timedelta

from pianola.application.ports import Clock, JobRepository
from pianola.domain.errors import JobNotFoundError, QueueFullError, RateLimitedError
from pianola.domain.job import Job, JobStatus

_HOUR = timedelta(hours=1)


@dataclass(frozen=True, slots=True)
class QueueLimits:
    max_waiting: int = 5
    max_active_per_ip: int = 2
    max_per_ip_per_hour: int = 6
    #: ByteDance on 2 OCPU takes about 2x the song length (measured in phase 0).
    processing_factor: float = 2.2
    #: Download, model load and result packaging, regardless of the song length.
    overhead_s: float = 60.0

    def estimate_processing_s(self, duration_s: float) -> float:
        return duration_s * self.processing_factor + self.overhead_s


@dataclass(frozen=True, slots=True)
class QueuePosition:
    #: 0 while the job is being processed, 1 for the next one, and so on.
    position: int
    estimated_wait_s: float


class JobQueue:
    """Admission rules plus ordering. Used from the event loop only (not thread-safe)."""

    def __init__(self, repository: JobRepository, clock: Clock, limits: QueueLimits) -> None:
        self._repository = repository
        self._clock = clock
        self.limits = limits
        self._waiting: deque[str] = deque()
        self._running: str | None = None
        self._running_since: datetime | None = None
        self._submissions: defaultdict[str, deque[datetime]] = defaultdict(deque)

    # --- admission -------------------------------------------------------------------------

    def check_admission(self, client_ip: str) -> None:
        """Cheap pre-check, run before the expensive duration probe.

        Raises ``QueueFullError`` or ``RateLimitedError``.
        """
        if len(self._waiting) >= self.limits.max_waiting:
            raise QueueFullError("queue is full")
        active = sum(1 for j in self._repository.all() if j.client_ip == client_ip and j.is_active)
        if active >= self.limits.max_active_per_ip:
            raise RateLimitedError("too many active jobs for this address")
        recent = self._recent_submissions(client_ip)
        if len(recent) >= self.limits.max_per_ip_per_hour:
            raise RateLimitedError("hourly limit reached for this address")

    def submit(self, job: Job) -> None:
        """Re-check the limits and enqueue, storing the job."""
        self.check_admission(job.client_ip)
        self._repository.add(job)
        self._waiting.append(job.id)
        self._submissions[job.client_ip].append(self._clock.now())

    def _recent_submissions(self, client_ip: str) -> deque[datetime]:
        times = self._submissions.get(client_ip)
        if times is None:
            return deque()
        cutoff = self._clock.now() - _HOUR
        while times and times[0] < cutoff:
            times.popleft()
        if not times:
            del self._submissions[client_ip]
            return deque()
        return times

    # --- worker side -----------------------------------------------------------------------

    def next_job_id(self) -> str | None:
        """Take the next waiting job and mark it as the one being processed."""
        while self._waiting:
            job_id = self._waiting.popleft()
            if self._is_queued(job_id):  # skip jobs deleted while waiting
                self._running = job_id
                self._running_since = self._clock.now()
                return job_id
        return None

    def cancel(self, job_id: str) -> None:
        """Free the place of a job deleted while it was still waiting."""
        with suppress(ValueError):
            self._waiting.remove(job_id)

    def finished(self, job_id: str) -> None:
        if self._running == job_id:
            self._running = None
            self._running_since = None

    def _is_queued(self, job_id: str) -> bool:
        try:
            return self._repository.get(job_id).status is JobStatus.QUEUED
        except JobNotFoundError:  # deleted while waiting
            return False

    # --- queries ---------------------------------------------------------------------------

    def waiting_count(self) -> int:
        return len(self._waiting)

    def position(self, job_id: str) -> QueuePosition | None:
        """Place in line and estimated wait; ``None`` when the job is not in the queue."""
        now = self._clock.now()
        wait = 0.0
        if self._running is not None:
            running = self._safe_get(self._running)
            if self._running == job_id:
                return QueuePosition(0, 0.0)
            if running is not None and self._running_since is not None:
                total = self.limits.estimate_processing_s(running.duration_s)
                elapsed = (now - self._running_since).total_seconds()
                wait += max(total - elapsed, 0.0)
        for index, waiting_id in enumerate(self._waiting, start=1):
            if waiting_id == job_id:
                return QueuePosition(index, wait)
            ahead = self._safe_get(waiting_id)
            if ahead is not None:
                wait += self.limits.estimate_processing_s(ahead.duration_s)
        return None

    def _safe_get(self, job_id: str) -> Job | None:
        try:
            return self._repository.get(job_id)
        except JobNotFoundError:
            return None
