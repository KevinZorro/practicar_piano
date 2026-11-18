"""Domain errors. Adapters translate library failures into these."""


class NotacaidaError(Exception):
    """Base class for all expected failures.

    ``code`` is a stable machine-readable identifier shown to API clients; the message
    is for logs and never contains the video link.
    """

    code = "internal_error"


class InvalidVideoUrlError(NotacaidaError):
    """The input is not an acceptable YouTube video link."""

    code = "invalid_url"


class VideoBlockedError(NotacaidaError):
    """The video is on the block list (for example after a rights claim)."""

    code = "video_blocked"


class DurationLimitExceededError(NotacaidaError):
    """The audio is longer than the configured limit."""

    code = "duration_limit"


class DownloadError(NotacaidaError):
    """The audio could not be downloaded."""

    code = "download_failed"


class TranscriptionError(NotacaidaError):
    """A model failed to transcribe the audio."""

    code = "transcription_failed"


class QueueFullError(NotacaidaError):
    code = "queue_full"


class RateLimitedError(NotacaidaError):
    code = "rate_limited"


class JobNotFoundError(NotacaidaError):
    code = "job_not_found"


class ResultNotReadyError(NotacaidaError):
    code = "result_not_ready"


class InvalidTransitionError(NotacaidaError):
    code = "invalid_transition"
