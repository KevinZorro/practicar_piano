from pathlib import Path

import pytest

from notacaida.application.process_job import ProcessJob
from notacaida.domain.job import Job, JobStatus
from notacaida.domain.notes import NoteEvent
from notacaida.domain.video_url import VideoUrl
from tests.support.fakes import (
    DictJobRepository,
    DictResultStore,
    FakeClock,
    FakeDownloader,
    FakeMidiReader,
    FakeScoreBuilder,
    FakeTranscriber,
)

VIDEO_ID = "dQw4w9WgXcQ"


class Setup:
    def __init__(
        self,
        tmp_path: Path,
        *,
        downloader: FakeDownloader | None = None,
        transcriber: FakeTranscriber | None = None,
        results: DictResultStore | None = None,
    ) -> None:
        self.clock = FakeClock()
        self.repo = DictJobRepository()
        self.results = results or DictResultStore()
        self.downloader = downloader or FakeDownloader({VIDEO_ID: 190.0})
        self.transcriber = transcriber or FakeTranscriber("bytedance")
        self.job = Job("j1", VideoUrl(VIDEO_ID), "ip", 190.0, self.clock.now())
        self.repo.add(self.job)
        self.use_case = ProcessJob(
            downloader=self.downloader,
            transcriber=self.transcriber,
            reader=FakeMidiReader((NoteEvent(60, 0, 1, 80), NoteEvent(64, 1, 2, 70))),
            repository=self.repo,
            results=self.results,
            clock=self.clock,
            score_builder=FakeScoreBuilder(),
            work_dir=tmp_path,
        )

    def leftovers(self, tmp_path: Path) -> list[Path]:
        return list(tmp_path.iterdir())


def test_success_stores_the_result_and_deletes_the_audio(tmp_path: Path) -> None:
    s = Setup(tmp_path)
    s.use_case.execute("j1")
    assert s.job.status is JobStatus.DONE
    result = s.results.take("j1")
    assert [lv.name for lv in result.levels] == ["original", "playable", "easy"]
    assert [n.pitch for n in result.levels[0].notes] == [60, 64]
    assert result.levels[0].score is None
    assert all(lv.score is not None for lv in result.levels[1:])
    assert result.duration_s == 190.0
    assert s.downloader.downloaded
    assert not s.downloader.downloaded[0].exists()
    assert s.leftovers(tmp_path) == []
    assert s.job.video is None


def test_download_failure_marks_failed_with_stable_code(tmp_path: Path) -> None:
    s = Setup(tmp_path, downloader=FakeDownloader(failing_ids=frozenset({VIDEO_ID})))
    s.use_case.execute("j1")
    assert s.job.status is JobStatus.FAILED
    assert s.job.error_code == "download_failed"
    assert s.leftovers(tmp_path) == []


def test_transcription_failure_deletes_the_audio(tmp_path: Path) -> None:
    s = Setup(tmp_path, transcriber=FakeTranscriber("bytedance", fails=True))
    s.use_case.execute("j1")
    assert s.job.error_code == "transcription_failed"
    assert not s.downloader.downloaded[0].exists()
    assert s.leftovers(tmp_path) == []
    with pytest.raises(Exception, match="j1"):
        s.results.take("j1")


def test_unexpected_error_becomes_internal_error_without_leaking_details(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    s = Setup(tmp_path, results=DictResultStore(fails=True))
    with caplog.at_level("WARNING"):
        s.use_case.execute("j1")
    assert s.job.status is JobStatus.FAILED
    assert s.job.error_code == "internal_error"
    assert "disk full" not in caplog.text
    assert "OSError" in caplog.text
    assert s.leftovers(tmp_path) == []


def test_logs_never_contain_the_video_id(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    s = Setup(tmp_path, downloader=FakeDownloader(failing_ids=frozenset({VIDEO_ID})))
    with caplog.at_level("DEBUG"):
        s.use_case.execute("j1")
    assert VIDEO_ID not in caplog.text
