"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse

from pianola.api.container import Container
from pianola.api.errors import ERROR_RESPONSES, install_error_handlers
from pianola.api.schemas import (
    CreateJobRequest,
    JobResponse,
    LevelOut,
    MeasureOut,
    NoteOut,
    ResultMeta,
    ResultResponse,
    ScoreOut,
)
from pianola.application.job_service import JobView
from pianola.domain.errors import JobNotFoundError
from pianola.domain.job import JobStatus
from pianola.domain.result import SongResult

API_VERSION = "1"
_TERMINAL = frozenset({JobStatus.DONE, JobStatus.FAILED, JobStatus.EXPIRED})


def _job_response(job_id: str, view: JobView) -> JobResponse:
    return JobResponse(
        job_id=job_id,
        status=view.status,
        duration_s=view.duration_s,
        position=view.position,
        estimated_wait_s=view.estimated_wait_s,
        error_code=view.error_code,
    )


def _client_ip(request: Request, trust_proxy: bool) -> str:
    if trust_proxy:
        forwarded = request.headers.get("x-real-ip")
        if forwarded:
            return forwarded.strip()
    return request.client.host if request.client else "unknown"


def create_app(container: Container) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        del app
        stop = asyncio.Event()
        task = asyncio.create_task(container.worker.run_forever(stop)) if container.worker else None
        try:
            yield
        finally:
            stop.set()
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task

    app = FastAPI(
        title="Pianola API",
        version=API_VERSION,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )
    install_error_handlers(app)

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/v1/jobs", status_code=202, responses=ERROR_RESPONSES)
    async def create_job(body: CreateJobRequest, request: Request) -> JobResponse:
        """Queue a song. The job keeps running if the client disconnects."""
        # The probe is a blocking network call: keep it off the event loop.
        ip = _client_ip(request, container.trust_proxy)
        job = await asyncio.to_thread(container.submit.execute, body.url, ip)
        return _job_response(job.id, container.status.execute(job.id))

    @app.get("/api/v1/jobs/{job_id}", responses=ERROR_RESPONSES)
    async def get_job(job_id: str) -> JobResponse:
        return _job_response(job_id, container.status.execute(job_id))

    @app.get("/api/v1/jobs/{job_id}/events", responses=ERROR_RESPONSES)
    async def job_events(job_id: str, request: Request) -> StreamingResponse:
        """Server-sent events with each status change; closes when the job ends."""
        container.status.execute(job_id)  # 404 before the stream starts
        return StreamingResponse(
            _events(container, job_id, request),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/api/v1/jobs/{job_id}/result", responses=ERROR_RESPONSES)
    async def get_result(job_id: str) -> ResultResponse:
        """The transcription. Repeatable until the client calls DELETE."""
        result = container.fetch.execute(job_id)
        return _result_response(result)

    @app.delete("/api/v1/jobs/{job_id}", status_code=204, responses=ERROR_RESPONSES)
    async def delete_job(job_id: str) -> Response:
        """Confirm delivery or cancel: the server forgets the job and its result."""
        container.delete.execute(job_id)
        return Response(status_code=204)

    return app


def _result_response(result: SongResult) -> ResultResponse:
    return ResultResponse(
        meta=ResultMeta(
            duration_s=result.duration_s,
            tempo_bpm=result.tempo_bpm,
            tempo_confidence=result.tempo_confidence,
        ),
        levels=[
            LevelOut(
                name=level.name,
                notes=[
                    NoteOut(pitch=n.pitch, start_s=n.start_s, end_s=n.end_s, velocity=n.velocity)
                    for n in level.notes
                ],
                notes_dropped_ratio=level.stats.notes_dropped_ratio,
                max_polyphony_before=level.stats.max_polyphony_before,
                max_polyphony_after=level.stats.max_polyphony_after,
                score=None
                if level.score is None
                else ScoreOut(
                    musicxml=level.score.musicxml,
                    tempo_bpm=level.score.tempo_bpm,
                    measures=[
                        MeasureOut(measure=m.measure, start_s=m.start_s)
                        for m in level.score.timemap
                    ],
                ),
            )
            for level in result.levels
        ],
    )


async def _events(container: Container, job_id: str, request: Request) -> AsyncIterator[str]:
    last: tuple[JobStatus, int | None] | None = None
    idle = 0.0
    while not await request.is_disconnected():
        try:
            view = container.status.execute(job_id)
        except JobNotFoundError:
            yield _sse("error", {"code": "job_not_found"})
            return
        key = (view.status, view.position)
        if key != last:
            last, idle = key, 0.0
            yield _sse("status", _job_response(job_id, view).model_dump(mode="json"))
        if view.status in _TERMINAL:
            return
        await asyncio.sleep(container.sse_poll_s)
        idle += container.sse_poll_s
        if idle >= container.sse_heartbeat_s:
            idle = 0.0
            yield ": keepalive\n\n"


def _sse(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
