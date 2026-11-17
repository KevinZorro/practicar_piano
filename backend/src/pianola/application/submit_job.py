"""Use case: accept a link and create a job."""

from __future__ import annotations

from collections.abc import Callable

from pianola.application.ports import Clock, DurationProbe, JobRepository
from pianola.domain.job import Job
from pianola.domain.notes import DurationPolicy
from pianola.domain.video_url import VideoUrl


class SubmitJob:
    def __init__(
        self,
        *,
        probe: DurationProbe,
        repository: JobRepository,
        clock: Clock,
        new_id: Callable[[], str],
        policy: DurationPolicy | None = None,
    ) -> None:
        self._probe = probe
        self._repository = repository
        self._clock = clock
        self._new_id = new_id
        self._policy = policy or DurationPolicy()

    def execute(self, raw_url: str, client_ip: str) -> Job:
        """Validate the link and its duration, then register a queued job.

        Raises ``InvalidVideoUrlError``, ``DownloadError`` (probe failed) or
        ``DurationLimitExceededError`` before anything is stored.
        """
        video = VideoUrl.parse(raw_url)
        duration_s = self._probe.probe(video)
        self._policy.check(duration_s)
        job = Job(
            id=self._new_id(),
            video=video,
            client_ip=client_ip,
            duration_s=duration_s,
            created_at=self._clock.now(),
        )
        self._repository.add(job)
        return job
