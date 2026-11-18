"""What the HTTP layer needs, assembled by the composition root."""

from __future__ import annotations

from dataclasses import dataclass

from teclario.application.job_service import DeleteJob, FetchResult, GetJobStatus
from teclario.application.submit_job import SubmitJob
from teclario.application.worker import Worker


@dataclass(frozen=True, slots=True)
class Container:
    submit: SubmitJob
    status: GetJobStatus
    fetch: FetchResult
    delete: DeleteJob
    worker: Worker | None = None
    #: Trust ``X-Real-IP`` set by Nginx. Only enable behind the proxy: clients can forge it.
    trust_proxy: bool = False
    sse_poll_s: float = 1.0
    sse_heartbeat_s: float = 15.0
