"""Domain errors. Adapters translate library failures into these."""


class TeclarioError(Exception):
    """Base class for all expected failures.

    ``code`` is a stable machine-readable identifier shown to API clients; the message
    is for logs and never contains the video link.
    """

    code = "internal_error"


class InvalidVideoUrlError(TeclarioError):
    """The input is not an acceptable YouTube video link."""

    code = "invalid_url"


class VideoBlockedError(TeclarioError):
    """The video is on the block list (for example after a rights claim)."""

    code = "video_blocked"


class DurationLimitExceededError(TeclarioError):
    """The audio is longer than the configured limit."""

    code = "duration_limit"


class DownloadError(TeclarioError):
    """The audio could not be downloaded."""

    code = "download_failed"


class TranscriptionError(TeclarioError):
    """A model failed to transcribe the audio."""

    code = "transcription_failed"


class QueueFullError(TeclarioError):
    code = "queue_full"


class RateLimitedError(TeclarioError):
    code = "rate_limited"


class JobNotFoundError(TeclarioError):
    code = "job_not_found"


class ResultNotReadyError(TeclarioError):
    code = "result_not_ready"


class InvalidTransitionError(TeclarioError):
    code = "invalid_transition"
