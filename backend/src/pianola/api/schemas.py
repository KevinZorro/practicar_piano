"""Request and response bodies. They are the public contract (see docs/api/openapi.json)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from pianola.domain.job import JobStatus


class CreateJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, max_length=2048, description="YouTube video link")


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    duration_s: float
    position: int | None = Field(
        default=None, description="0 = processing, 1 = next; null once it left the queue"
    )
    estimated_wait_s: float | None = None
    error_code: str | None = None


class NoteOut(BaseModel):
    pitch: int = Field(ge=0, le=127)
    start_s: float
    end_s: float
    velocity: int = Field(ge=0, le=127)


class ResultMeta(BaseModel):
    duration_s: float
    note_count: int


class ResultResponse(BaseModel):
    meta: ResultMeta
    notes: list[NoteOut]


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
