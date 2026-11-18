from datetime import UTC, datetime

import pytest

from teclario.domain.errors import InvalidTransitionError
from teclario.domain.job import Job, JobStatus
from teclario.domain.video_url import VideoUrl

T0 = datetime(2026, 11, 17, tzinfo=UTC)
HAPPY_PATH = [
    JobStatus.DOWNLOADING,
    JobStatus.TRANSCRIBING,
    JobStatus.SCORING,
    JobStatus.DONE,
]


def make_job() -> Job:
    return Job("abc", VideoUrl("dQw4w9WgXcQ"), "203.0.113.9", 200.0, T0)


def test_new_job_is_queued_and_active() -> None:
    job = make_job()
    assert job.status is JobStatus.QUEUED
    assert job.is_active


def test_happy_path_ends_done_and_forgets_the_link() -> None:
    job = make_job()
    for status in HAPPY_PATH:
        job.transition_to(status, T0)
    assert job.status is JobStatus.DONE
    assert job.video is None
    assert not job.is_active


@pytest.mark.parametrize("stage", [JobStatus.QUEUED, *HAPPY_PATH[:-1]])
def test_any_active_stage_can_fail_and_keeps_the_code(stage: JobStatus) -> None:
    job = make_job()
    for status in (
        HAPPY_PATH[: HAPPY_PATH.index(stage) + 1] if stage is not JobStatus.QUEUED else []
    ):
        job.transition_to(status, T0)
    job.transition_to(JobStatus.FAILED, T0, "download_failed")
    assert job.error_code == "download_failed"
    assert job.video is None


@pytest.mark.parametrize(
    ("setup", "target"),
    [
        ([], JobStatus.TRANSCRIBING),  # cannot skip the download
        ([], JobStatus.DONE),
        ([JobStatus.DOWNLOADING], JobStatus.QUEUED),  # no going back
        ([JobStatus.DOWNLOADING, JobStatus.FAILED], JobStatus.DOWNLOADING),
        (HAPPY_PATH, JobStatus.FAILED),  # a finished job cannot fail afterwards
    ],
)
def test_invalid_transitions_raise(setup: list[JobStatus], target: JobStatus) -> None:
    job = make_job()
    for status in setup:
        job.transition_to(status, T0)
    with pytest.raises(InvalidTransitionError):
        job.transition_to(target, T0)


def test_done_job_can_expire() -> None:
    job = make_job()
    for status in HAPPY_PATH:
        job.transition_to(status, T0)
    job.transition_to(JobStatus.EXPIRED, T0)
    assert job.status is JobStatus.EXPIRED


def test_repr_hides_link_and_ip() -> None:
    text = repr(make_job())
    assert "dQw4w9WgXcQ" not in text
    assert "203.0.113.9" not in text
