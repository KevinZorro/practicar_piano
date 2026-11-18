"""The real clock (the only place that reads the time, apart from tests' fakes)."""

from __future__ import annotations

from datetime import UTC, datetime


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)
