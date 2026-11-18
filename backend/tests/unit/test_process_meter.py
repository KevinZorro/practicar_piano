from __future__ import annotations

import pytest

from teclario.domain.errors import TranscriptionError
from teclario.domain.models import TranscriptionOutput
from teclario.infrastructure.process_meter import SubprocessResourceMeter
from tests.support import workers


def test_measure_returns_value_wall_time_and_peak_memory() -> None:
    measured = SubprocessResourceMeter().measure(workers.succeed)

    assert measured.value == TranscriptionOutput(note_count=7, inference_seconds=0.5)
    assert measured.usage.wall_seconds > 0
    assert measured.usage.peak_rss_mb > 10


def test_peak_memory_reflects_what_the_work_allocates() -> None:
    usage = SubprocessResourceMeter().measure(workers.allocate_megabytes).usage

    assert usage.peak_rss_mb > 120  # the work holds 120 MB on top of the interpreter


def test_measure_translates_worker_exceptions() -> None:
    with pytest.raises(TranscriptionError, match="ValueError: model exploded"):
        SubprocessResourceMeter().measure(workers.fail)


def test_measure_reports_a_killed_worker() -> None:
    with pytest.raises(TranscriptionError, match="exit code 9"):
        SubprocessResourceMeter().measure(workers.die)


def test_measure_kills_a_worker_that_exceeds_the_timeout() -> None:
    with pytest.raises(TranscriptionError, match="timed out"):
        SubprocessResourceMeter(timeout_seconds=0.5).measure(workers.hang)


def test_measure_rejects_work_that_cannot_be_pickled() -> None:
    with pytest.raises(TranscriptionError, match="worker process"):
        SubprocessResourceMeter().measure(lambda: 1)
