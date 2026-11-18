"""A song-processing job and its state machine."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from notacaida.domain.errors import InvalidTransitionError
from notacaida.domain.video_url import VideoUrl


class JobStatus(StrEnum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    TRANSCRIBING = "transcribing"
    SCORING = "scoring"
    DONE = "done"
    FAILED = "failed"
    EXPIRED = "expired"


_ALLOWED: dict[JobStatus, frozenset[JobStatus]] = {
    JobStatus.QUEUED: frozenset({JobStatus.DOWNLOADING, JobStatus.FAILED}),
    JobStatus.DOWNLOADING: frozenset({JobStatus.TRANSCRIBING, JobStatus.FAILED}),
    JobStatus.TRANSCRIBING: frozenset({JobStatus.SCORING, JobStatus.FAILED}),
    JobStatus.SCORING: frozenset({JobStatus.DONE, JobStatus.FAILED}),
    JobStatus.DONE: frozenset({JobStatus.EXPIRED}),
    JobStatus.FAILED: frozenset(),
    JobStatus.EXPIRED: frozenset(),
}

ACTIVE_STATUSES = frozenset(
    {JobStatus.QUEUED, JobStatus.DOWNLOADING, JobStatus.TRANSCRIBING, JobStatus.SCORING}
)


@dataclass(slots=True)
class Job:
    """One song on its way through the pipeline.

    ``id`` is a random 128-bit token that doubles as the client's credential. The link
    (``video``) lives only in memory and is dropped by ``forget_source`` when work ends.
    """

    id: str
    video: VideoUrl | None
    client_ip: str
    duration_s: float
    created_at: datetime
    status: JobStatus = JobStatus.QUEUED
    error_code: str | None = None
    updated_at: datetime = field(init=False)

    def __post_init__(self) -> None:
        self.updated_at = self.created_at

    @property
    def is_active(self) -> bool:
        return self.status in ACTIVE_STATUSES

    def transition_to(self, new: JobStatus, now: datetime, error_code: str | None = None) -> None:
        if new not in _ALLOWED[self.status]:
            raise InvalidTransitionError(f"{self.status} -> {new} is not allowed")
        self.status = new
        self.updated_at = now
        if new is JobStatus.FAILED:
            self.error_code = error_code or "internal_error"
        if new in (JobStatus.FAILED, JobStatus.DONE, JobStatus.EXPIRED):
            self.video = None  # the link is not needed any more and must not linger

    def __repr__(self) -> str:
        # Never include the link or the IP in logs.
        return f"Job(status={self.status.value})"
