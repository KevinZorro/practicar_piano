from datetime import UTC, datetime

import pytest

from pianola.domain.errors import JobNotFoundError, ResultNotReadyError
from pianola.domain.job import Job
from pianola.domain.notes import NoteEvent, Transcription
from pianola.domain.video_url import VideoUrl
from pianola.infrastructure.memory_stores import InMemoryJobRepository, TtlResultStore
from tests.support.fakes import FakeClock

RESULT = Transcription((NoteEvent(60, 0, 1, 80),), 10.0)


def test_repository_add_get_remove() -> None:
    repo = InMemoryJobRepository()
    job = Job("a", VideoUrl("dQw4w9WgXcQ"), "ip", 1.0, datetime(2026, 1, 1, tzinfo=UTC))
    repo.add(job)
    assert repo.get("a") is job
    assert repo.all() == [job]
    repo.remove("a")
    repo.remove("a")  # idempotent
    with pytest.raises(JobNotFoundError):
        repo.get("a")


def test_result_can_be_taken_repeatedly_until_discarded() -> None:
    store = TtlResultStore(FakeClock())
    store.put("a", RESULT)
    assert store.take("a") is RESULT
    assert store.take("a") is RESULT
    store.discard("a")
    with pytest.raises(ResultNotReadyError):
        store.take("a")


def test_result_expires_after_the_safety_ttl() -> None:
    clock = FakeClock()
    store = TtlResultStore(clock, ttl_s=60)
    store.put("a", RESULT)
    clock.advance(59)
    assert store.take("a") is RESULT
    clock.advance(1)
    with pytest.raises(ResultNotReadyError):
        store.take("a")
    assert len(store) == 0


def test_purge_returns_only_expired_ids() -> None:
    clock = FakeClock()
    store = TtlResultStore(clock, ttl_s=60)
    store.put("old", RESULT)
    clock.advance(30)
    store.put("new", RESULT)
    clock.advance(31)
    assert store.purge_expired() == ["old"]
    assert store.take("new") is RESULT


def test_discard_of_unknown_id_is_a_noop() -> None:
    TtlResultStore(FakeClock()).discard("missing")
