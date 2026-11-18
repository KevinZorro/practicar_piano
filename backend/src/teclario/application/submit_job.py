"""Use case: accept a link and create a job."""

from __future__ import annotations

from collections.abc import Callable

from teclario.application.job_queue import JobQueue
from teclario.application.ports import Clock, DurationProbe
from teclario.domain.errors import VideoBlockedError
from teclario.domain.job import Job
from teclario.domain.notes import DurationPolicy
from teclario.domain.video_url import VideoUrl


class SubmitJob:
    def __init__(
        self,
        *,
        probe: DurationProbe,
        queue: JobQueue,
        clock: Clock,
        new_id: Callable[[], str],
        policy: DurationPolicy | None = None,
        blocked_video_ids: frozenset[str] = frozenset(),
    ) -> None:
        self._probe = probe
        self._queue = queue
        self._clock = clock
        self._new_id = new_id
        self._policy = policy or DurationPolicy()
        self._blocked = blocked_video_ids

    def execute(self, raw_url: str, client_ip: str) -> Job:
        """Validate the link and its duration, then register a queued job.

        Raises ``InvalidVideoUrlError``, ``VideoBlockedError``, ``QueueFullError``,
        ``RateLimitedError``, ``DownloadError`` (probe failed) or
        ``DurationLimitExceededError`` before anything is stored. The cheap checks run first so a
        full queue never triggers a network probe.
        """
        video = VideoUrl.parse(raw_url)
        if video.video_id in self._blocked:
            raise VideoBlockedError("video is on the block list")
        self._queue.check_admission(client_ip)
        duration_s = self._probe.probe(video)
        self._policy.check(duration_s)
        job = Job(
            id=self._new_id(),
            video=video,
            client_ip=client_ip,
            duration_s=duration_s,
            created_at=self._clock.now(),
        )
        self._queue.submit(job)
        return job
