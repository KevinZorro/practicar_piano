import itertools

import pytest

from pianola.application.submit_job import SubmitJob
from pianola.domain.errors import DownloadError, DurationLimitExceededError, InvalidVideoUrlError
from pianola.domain.job import JobStatus
from pianola.domain.notes import DurationPolicy
from tests.support.fakes import DictJobRepository, FakeClock, FakeProbe

URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def make(probe: FakeProbe | None = None) -> tuple[SubmitJob, DictJobRepository]:
    repo = DictJobRepository()
    ids = itertools.count(1)
    use_case = SubmitJob(
        probe=probe or FakeProbe(200.0),
        repository=repo,
        clock=FakeClock(),
        new_id=lambda: f"job-{next(ids)}",
        policy=DurationPolicy(max_seconds=600),
    )
    return use_case, repo


def test_creates_a_queued_job() -> None:
    use_case, repo = make()
    job = use_case.execute(URL, "198.51.100.1")
    assert job.status is JobStatus.QUEUED
    assert job.duration_s == 200.0
    assert repo.get(job.id) is job


def test_accepts_exactly_the_maximum_duration() -> None:
    use_case, _ = make(FakeProbe(600.0))
    assert use_case.execute(URL, "ip").duration_s == 600.0


@pytest.mark.parametrize("duration", [600.1, 0.0, -5.0])
def test_rejects_durations_outside_the_policy(duration: float) -> None:
    use_case, repo = make(FakeProbe(duration))
    with pytest.raises(DurationLimitExceededError):
        use_case.execute(URL, "ip")
    assert repo.all() == []


def test_rejects_non_youtube_links_before_probing() -> None:
    use_case, repo = make(FakeProbe(fails=True))  # would raise DownloadError if reached
    with pytest.raises(InvalidVideoUrlError):
        use_case.execute("https://evil.example/watch?v=dQw4w9WgXcQ", "ip")
    assert repo.all() == []


def test_probe_failure_stores_nothing() -> None:
    use_case, repo = make(FakeProbe(fails=True))
    with pytest.raises(DownloadError):
        use_case.execute(URL, "ip")
    assert repo.all() == []
