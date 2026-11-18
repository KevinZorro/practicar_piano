"""Defense in depth: the video link must never reach a log line (ADR 0016, security rules)."""

from __future__ import annotations

import logging
import re

_LINK = re.compile(r"https?://(?:[\w-]+\.)*(?:youtube\.com|youtu\.be)\S*", re.IGNORECASE)
_PLACEHOLDER = "<video-link>"


def redact(text: str) -> str:
    return _LINK.sub(_PLACEHOLDER, text)


class RedactVideoLinks(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = None
        return True


def install_log_redaction() -> None:
    """Attach the filter to every handler of the root and uvicorn loggers."""
    redactor = RedactVideoLinks()
    for name in ("", "uvicorn", "uvicorn.error", "uvicorn.access"):
        for handler in logging.getLogger(name).handlers:
            if not any(isinstance(f, RedactVideoLinks) for f in handler.filters):
                handler.addFilter(redactor)
