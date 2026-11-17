"""Domain errors. Adapters translate library failures into these."""


class PianolaError(Exception):
    """Base class for all expected failures.

    ``code`` is a stable machine-readable identifier shown to API clients; the message
    is for logs and never contains the video link.
    """

    code = "internal_error"


class InvalidVideoUrlError(PianolaError):
    """The input is not an acceptable YouTube video link."""

    code = "invalid_url"


class DurationLimitExceededError(PianolaError):
    """The audio is longer than the configured limit."""

    code = "duration_limit"


class DownloadError(PianolaError):
    """The audio could not be downloaded."""

    code = "download_failed"


class TranscriptionError(PianolaError):
    """A model failed to transcribe the audio."""

    code = "transcription_failed"


class QueueFullError(PianolaError):
    code = "queue_full"


class RateLimitedError(PianolaError):
    code = "rate_limited"


class JobNotFoundError(PianolaError):
    code = "job_not_found"


class ResultNotReadyError(PianolaError):
    code = "result_not_ready"


class InvalidTransitionError(PianolaError):
    code = "invalid_transition"
