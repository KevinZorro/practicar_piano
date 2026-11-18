"""Request and response bodies. They are the public contract (see docs/api/openapi.json)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from teclario.domain.job import JobStatus


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


class MeasureOut(BaseModel):
    measure: int = Field(ge=1, description="1-based, as in the MusicXML")
    start_s: float = Field(description="Seconds from the start of the video")


class ScoreOut(BaseModel):
    musicxml: str
    tempo_bpm: float
    measures: list[MeasureOut]


class LevelOut(BaseModel):
    name: Literal["original", "playable", "easy"]
    notes: list[NoteOut]
    notes_dropped_ratio: float
    max_polyphony_before: int
    max_polyphony_after: int
    score: ScoreOut | None = Field(default=None, description="Absent for the original level")


class ResultMeta(BaseModel):
    duration_s: float
    tempo_bpm: float
    tempo_confidence: Literal["high", "low"]


class ResultResponse(BaseModel):
    meta: ResultMeta
    levels: list[LevelOut]


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
