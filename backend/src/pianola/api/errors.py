"""The single place where domain errors become HTTP responses."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from pianola.api.schemas import ErrorBody, ErrorResponse
from pianola.domain.errors import PianolaError

# code -> (HTTP status, message shown to the user). Messages never echo exception text,
# which could carry the link.
_HTTP: dict[str, tuple[int, str]] = {
    "invalid_url": (422, "That is not a valid YouTube video link."),
    "video_blocked": (451, "This video cannot be processed by this service."),
    "duration_limit": (422, "The video is too long (maximum 10 minutes)."),
    "download_failed": (502, "The audio could not be downloaded."),
    "transcription_failed": (500, "The song could not be transcribed."),
    "queue_full": (503, "The queue is full. Try again in a while."),
    "rate_limited": (429, "Too many requests from your address. Try again later."),
    "job_not_found": (404, "Unknown job. It may have expired or been deleted."),
    "result_not_ready": (409, "The result is not ready."),
    "internal_error": (500, "Unexpected error."),
}
_RETRY_AFTER_S = {"queue_full": "300", "rate_limited": "600"}

ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    status: {"model": ErrorResponse, "description": "Error"}
    for status in sorted({s for s, _ in _HTTP.values()})
}


def error_response(code: str) -> JSONResponse:
    status, message = _HTTP.get(code, _HTTP["internal_error"])
    body = ErrorResponse(error=ErrorBody(code=code, message=message))
    headers = {"Retry-After": _RETRY_AFTER_S[code]} if code in _RETRY_AFTER_S else None
    return JSONResponse(body.model_dump(), status_code=status, headers=headers)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(PianolaError)
    async def _domain_error(request: Request, exc: PianolaError) -> JSONResponse:
        del request
        return error_response(exc.code)

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        del request, exc
        return error_response("internal_error")
