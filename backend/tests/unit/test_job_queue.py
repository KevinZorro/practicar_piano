import pytest

from teclario.application.job_queue import JobQueue, QueueLimits
from teclario.domain.errors import QueueFullError, RateLimitedError
from teclario.domain.job import Job, JobStatus
from teclario.domain.video_url import VideoUrl
from tests.support.fakes import DictJobRepository, FakeClock

LIMITS = QueueLimits(
    max_waiting=3,
    max_active_per_ip=2,
    max_per_ip_per_hour=4,
    processing_factor=2.0,
    overhead_s=0.0,
)


class Env:
    def __init__(self, limits: QueueLimits = LIMITS) -> None:
        self.clock = FakeClock()
        self.repo = DictJobRepository()
        self.queue = JobQueue(self.repo, self.clock, limits)
        self.count = 0

    def submit(self, ip: str = "10.0.0.1", duration_s: float = 100.0) -> Job:
        self.count += 1
        job = Job(f"j{self.count}", VideoUrl("dQw4w9WgXcQ"), ip, duration_s, self.clock.now())
        self.queue.submit(job)
        return job

    def finish(self, job: Job) -> None:
        """Walk a job through the pipeline the way the worker would."""
        now = self.clock.now()
        for status in (JobStatus.DOWNLOADING, JobStatus.TRANSCRIBING, JobStatus.SCORING):
            job.transition_to(status, now)
        job.transition_to(JobStatus.DONE, now)
        self.queue.finished(job.id)


def test_jobs_are_taken_in_order() -> None:
    env = Env()
    first, second = env.submit("a"), env.submit("b")
    assert env.queue.next_job_id() == first.id
    env.queue.finished(first.id)
    assert env.queue.next_job_id() == second.id
    assert env.queue.next_job_id() is None


def test_queue_full_rejects_with_queue_full() -> None:
    env = Env()
    for ip in ("a", "b", "c"):
        env.submit(ip)
    with pytest.raises(QueueFullError):
        env.queue.check_admission("d")
    with pytest.raises(QueueFullError):
        env.submit("d")


def test_taking_a_job_frees_a_waiting_place() -> None:
    env = Env()
    for ip in ("a", "b", "c"):
        env.submit(ip)
    env.queue.next_job_id()
    env.submit("d")  # does not raise: only waiting jobs count against the limit
    assert env.queue.waiting_count() == 3


def test_per_ip_active_limit_counts_waiting_and_running() -> None:
    env = Env()
    env.submit("a")
    env.submit("a")
    with pytest.raises(RateLimitedError):
        env.submit("a")
    env.submit("b")  # other addresses are unaffected


def test_finishing_a_job_frees_the_ip_slot() -> None:
    env = Env()
    first = env.submit("a")
    env.submit("a")
    env.queue.next_job_id()
    env.finish(first)
    env.submit("a")


def test_hourly_limit_slides_with_the_clock() -> None:
    env = Env()
    for _ in range(4):
        job = env.submit("a")
        env.queue.next_job_id()
        env.finish(job)
    with pytest.raises(RateLimitedError):
        env.submit("a")
    env.clock.advance(3601)
    env.submit("a")


def test_deleted_waiting_job_is_skipped_and_frees_its_place() -> None:
    env = Env()
    first, second = env.submit("a"), env.submit("b")
    env.queue.cancel(first.id)
    env.repo.remove(first.id)
    assert env.queue.waiting_count() == 1
    assert env.queue.next_job_id() == second.id


def test_stale_waiting_entry_for_a_missing_job_is_skipped() -> None:
    env = Env()
    first, second = env.submit("a"), env.submit("b")
    env.repo.remove(first.id)  # removed without cancel (e.g. a sweep)
    assert env.queue.next_job_id() == second.id


def test_position_and_estimated_wait_follow_the_jobs_ahead() -> None:
    env = Env()
    a = env.submit("a", 100.0)  # 200 s of work with factor 2
    b = env.submit("b", 50.0)  # 100 s
    c = env.submit("c", 10.0)
    assert env.queue.position(a.id).position == 1  # type: ignore[union-attr]
    env.queue.next_job_id()  # a starts
    env.clock.advance(50)
    assert env.queue.position(a.id).position == 0  # type: ignore[union-attr]
    pos_b = env.queue.position(b.id)
    pos_c = env.queue.position(c.id)
    assert pos_b is not None
    assert pos_c is not None
    assert (pos_b.position, pos_b.estimated_wait_s) == (1, 150.0)
    assert (pos_c.position, pos_c.estimated_wait_s) == (2, 250.0)


def test_estimate_never_goes_negative_when_the_job_overruns() -> None:
    env = Env()
    a = env.submit("a", 10.0)
    b = env.submit("b", 10.0)
    env.queue.next_job_id()
    env.clock.advance(10_000)
    pos = env.queue.position(b.id)
    assert pos is not None
    assert pos.estimated_wait_s == 0.0
    assert a.id


def test_unknown_job_has_no_position() -> None:
    assert Env().queue.position("nope") is None


def test_default_limits_match_adr_0016() -> None:
    limits = QueueLimits()
    assert (limits.max_waiting, limits.max_active_per_ip, limits.max_per_ip_per_hour) == (5, 2, 6)
    # a 3-minute song: about 7 minutes with the measured factor of ~2
    assert 6 * 60 < limits.estimate_processing_s(180) < 9 * 60
