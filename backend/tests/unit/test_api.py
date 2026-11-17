import json
import logging
from pathlib import Path

import pytest

from pianola.application.job_queue import QueueLimits
from tests.support.api import GOOD_ID, GOOD_URL, ApiEnv, build_api
from tests.support.fakes import FakeDownloader, FakeProbe


@pytest.fixture
def env(tmp_path: Path) -> ApiEnv:
    return build_api(tmp_path)


def submit(env: ApiEnv, url: str = GOOD_URL, ip: str | None = None) -> dict[str, object]:
    headers = {"x-real-ip": ip} if ip else {}
    response = env.client.post("/api/v1/jobs", json={"url": url}, headers=headers)
    assert response.status_code == 202, response.text
    body: dict[str, object] = response.json()
    return body


def test_healthz(env: ApiEnv) -> None:
    assert env.client.get("/healthz").json() == {"status": "ok"}


def test_create_job_returns_202_with_position(env: ApiEnv) -> None:
    body = submit(env)
    assert body["status"] == "queued"
    assert body["position"] == 1
    assert body["duration_s"] == 200.0
    assert isinstance(body["estimated_wait_s"], float)


def test_full_flow_status_result_delete(env: ApiEnv) -> None:
    job_id = str(submit(env)["job_id"])
    assert env.process_next()

    status = env.client.get(f"/api/v1/jobs/{job_id}").json()
    assert status["status"] == "done"
    assert status["position"] is None

    result = env.client.get(f"/api/v1/jobs/{job_id}/result").json()
    assert result["meta"] == {"duration_s": 180.0, "note_count": 2}
    assert result["notes"][0] == {"pitch": 60, "start_s": 0.0, "end_s": 1.0, "velocity": 80}
    # repeatable until the client confirms
    assert env.client.get(f"/api/v1/jobs/{job_id}/result").status_code == 200

    assert env.client.delete(f"/api/v1/jobs/{job_id}").status_code == 204
    assert env.client.get(f"/api/v1/jobs/{job_id}/result").status_code == 404
    assert env.client.get(f"/api/v1/jobs/{job_id}").status_code == 404


def test_result_before_done_is_409_with_stable_code(env: ApiEnv) -> None:
    job_id = str(submit(env)["job_id"])
    response = env.client.get(f"/api/v1/jobs/{job_id}/result")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "result_not_ready"


def test_failed_job_reports_error_code(tmp_path: Path) -> None:
    env = build_api(tmp_path, downloader=FakeDownloader(failing_ids=frozenset({GOOD_ID})))
    job_id = str(submit(env)["job_id"])
    env.process_next()
    body = env.client.get(f"/api/v1/jobs/{job_id}").json()
    assert (body["status"], body["error_code"]) == ("failed", "download_failed")


@pytest.mark.parametrize(
    ("url", "status", "code"),
    [
        ("https://evil.example/watch?v=dQw4w9WgXcQ", 422, "invalid_url"),
        ("not a link", 422, "invalid_url"),
    ],
)
def test_invalid_links_are_rejected(env: ApiEnv, url: str, status: int, code: str) -> None:
    response = env.client.post("/api/v1/jobs", json={"url": url})
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert url not in response.text


def test_too_long_video_is_rejected(tmp_path: Path) -> None:
    env = build_api(tmp_path, probe=FakeProbe(601.0))
    response = env.client.post("/api/v1/jobs", json={"url": GOOD_URL})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "duration_limit"


def test_probe_failure_is_502(tmp_path: Path) -> None:
    env = build_api(tmp_path, probe=FakeProbe(fails=True))
    response = env.client.post("/api/v1/jobs", json={"url": GOOD_URL})
    assert response.status_code == 502


def test_body_validation_errors_use_fastapi_422(env: ApiEnv) -> None:
    assert env.client.post("/api/v1/jobs", json={}).status_code == 422
    assert env.client.post("/api/v1/jobs", json={"url": "x" * 3000}).status_code == 422
    assert env.client.post("/api/v1/jobs", json={"url": GOOD_URL, "extra": 1}).status_code == 422


def test_full_queue_is_503_with_retry_after(tmp_path: Path) -> None:
    env = build_api(tmp_path, limits=QueueLimits(max_waiting=1, max_active_per_ip=9))
    submit(env, ip="1.1.1.1")
    response = env.client.post("/api/v1/jobs", json={"url": GOOD_URL})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "queue_full"
    assert response.headers["retry-after"] == "300"


def test_per_ip_limit_is_429_and_ignores_forged_header_by_default(tmp_path: Path) -> None:
    env = build_api(tmp_path, limits=QueueLimits(max_active_per_ip=1))
    submit(env, ip="1.1.1.1")
    # X-Real-IP is ignored without trust_proxy, so rotating it does not evade the limit
    response = env.client.post(
        "/api/v1/jobs", json={"url": GOOD_URL}, headers={"x-real-ip": "2.2.2.2"}
    )
    assert response.status_code == 429
    assert response.headers["retry-after"] == "600"


def test_per_ip_limit_uses_real_ip_behind_the_proxy(tmp_path: Path) -> None:
    env = build_api(tmp_path, limits=QueueLimits(max_active_per_ip=1), trust_proxy=True)
    submit(env, ip="1.1.1.1")
    submit(env, ip="2.2.2.2")
    response = env.client.post(
        "/api/v1/jobs", json={"url": GOOD_URL}, headers={"x-real-ip": "1.1.1.1"}
    )
    assert response.status_code == 429


def test_unexpected_errors_are_500_without_details(
    env: ApiEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(job_id: str) -> object:
        raise RuntimeError(f"secret detail {GOOD_URL}")

    monkeypatch.setattr(env.container.status, "execute", boom)
    response = env.client.get("/api/v1/jobs/x")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "secret" not in response.text


def parse_sse(text: str) -> list[tuple[str, dict[str, object]]]:
    events = []
    for block in text.strip().split("\n\n"):
        if block.startswith(":"):
            continue
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


def test_sse_of_a_finished_job_sends_one_event_and_closes(env: ApiEnv) -> None:
    job_id = str(submit(env)["job_id"])
    env.process_next()
    with env.client.stream("GET", f"/api/v1/jobs/{job_id}/events") as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["x-accel-buffering"] == "no"
        body = "".join(response.iter_text())
    events = parse_sse(body)
    assert [name for name, _ in events] == ["status"]
    assert events[0][1]["status"] == "done"


def test_sse_unknown_job_is_404_before_streaming(env: ApiEnv) -> None:
    assert env.client.get("/api/v1/jobs/nope/events").status_code == 404


def test_job_keeps_running_when_the_sse_client_disconnects(env: ApiEnv) -> None:
    job_id = str(submit(env)["job_id"])
    with env.client.stream("GET", f"/api/v1/jobs/{job_id}/events") as response:
        first = next(response.iter_text())
        assert "queued" in first
    # the client is gone; the job must still be processed and be retrievable
    assert env.process_next()
    assert env.client.get(f"/api/v1/jobs/{job_id}/result").status_code == 200


def test_lifespan_starts_the_worker_that_processes_jobs(tmp_path: Path) -> None:
    import time

    env = build_api(tmp_path, run_worker=True)
    with env.client:  # runs the lifespan: worker task starts and stops with the app
        job_id = str(submit(env)["job_id"])
        for _ in range(200):
            if env.client.get(f"/api/v1/jobs/{job_id}").json()["status"] == "done":
                break
            time.sleep(0.02)
        assert env.client.get(f"/api/v1/jobs/{job_id}").json()["status"] == "done"


def test_nothing_in_the_flow_logs_the_video_link(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    env = build_api(tmp_path, downloader=FakeDownloader(failing_ids=frozenset({GOOD_ID})))
    with caplog.at_level(logging.DEBUG):
        job_id = str(submit(env)["job_id"])
        env.process_next()
        env.client.get(f"/api/v1/jobs/{job_id}")
        env.client.post("/api/v1/jobs", json={"url": "https://evil.example/?v=" + GOOD_ID})
    assert GOOD_ID not in caplog.text
