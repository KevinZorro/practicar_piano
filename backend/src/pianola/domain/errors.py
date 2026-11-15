"""Domain errors. Adapters translate library failures into these."""


class PianolaError(Exception):
    """Base class for all expected failures."""


class InvalidVideoUrlError(PianolaError):
    """The input is not an acceptable YouTube video link."""


class DurationLimitExceededError(PianolaError):
    """The audio is longer than the configured limit."""


class DownloadError(PianolaError):
    """The audio could not be downloaded."""


class TranscriptionError(PianolaError):
    """A model failed to transcribe the audio."""
