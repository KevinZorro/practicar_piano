from __future__ import annotations

import logging
from pathlib import Path

import pytest

from pianola.application.benchmark import RunBenchmark
from pianola.application.links import SongEntry
from pianola.domain.video_url import VideoUrl
from tests.support.fakes import FakeDownloader, FakeSynthesizer, FakeTranscriber, InlineMeter

IDS = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]


def entries(count: int = 2) -> list[SongEntry]:
    return [
        SongEntry(
            index=i + 1, label=f"song {i + 1}", url=VideoUrl.parse(f"https://youtu.be/{IDS[i]}")
        )
        for i in range(count)
    ]


def build(
    downloader: FakeDownloader,
    transcribers: list[FakeTranscriber],
    max_duration: float = 600.0,
) -> tuple[RunBenchmark, FakeSynthesizer]:
    synthesizer = FakeSynthesizer()
    benchmark = RunBenchmark(
        downloader,
        transcribers,
        synthesizer,
        InlineMeter(),
        max_duration_seconds=max_duration,
        clock=iter([float(n) for n in range(100)]).__next__,
    )
    return benchmark, synthesizer


def test_run_transcribes_every_song_with_every_model(tmp_path: Path) -> None:
    models = [FakeTranscriber("basic-pitch"), FakeTranscriber("bytedance", notes=250)]
    benchmark, synthesizer = build(FakeDownloader(), models)

    results = benchmark.run(entries(), tmp_path / "out", tmp_path / "work")

    assert [len(r.runs) for r in results] == [2, 2]
    first = results[0]
    run = first.run_for("bytedance")
    assert run is not None and run.succeeded
    assert run.note_count == 250
    assert run.usage is not None and run.usage.peak_rss_mb == 900.0
    assert run.midi_path is not None and run.midi_path.exists()
    assert run.wav_path is not None and run.wav_path.exists()
    assert len(synthesizer.rendered) == 4
    assert first.duration_seconds == 180.0
    assert first.download_seconds == 1.0


def test_run_deletes_downloaded_audio_after_each_song(tmp_path: Path) -> None:
    downloader = FakeDownloader()
    benchmark, _ = build(downloader, [FakeTranscriber("basic-pitch")])

    benchmark.run(entries(), tmp_path / "out", tmp_path / "work")

    assert len(downloader.downloaded) == 2
    assert all(not path.exists() for path in downloader.downloaded)
    assert list((tmp_path / "work").iterdir()) == []


def test_run_isolates_model_failures_and_still_deletes_audio(tmp_path: Path) -> None:
    downloader = FakeDownloader()
    models = [FakeTranscriber("basic-pitch"), FakeTranscriber("bytedance", fails=True)]
    benchmark, _ = build(downloader, models)

    results = benchmark.run(entries(1), tmp_path / "out", tmp_path / "work")

    good, bad = results[0].runs
    assert good.succeeded
    assert not bad.succeeded and bad.error == "model exploded"
    assert all(not path.exists() for path in downloader.downloaded)


def test_run_records_download_failure_and_continues(tmp_path: Path) -> None:
    downloader = FakeDownloader(failing_ids=frozenset({IDS[0]}))
    model = FakeTranscriber("basic-pitch")
    benchmark, _ = build(downloader, [model])

    results = benchmark.run(entries(), tmp_path / "out", tmp_path / "work")

    assert results[0].download_error == "blocked by fake"
    assert not results[0].downloaded and results[0].runs == ()
    assert results[1].downloaded and results[1].runs[0].succeeded
    assert len(model.audio_seen) == 1


def test_run_rejects_songs_over_the_duration_limit_without_transcribing(tmp_path: Path) -> None:
    downloader = FakeDownloader(durations={IDS[0]: 1200.0})
    model = FakeTranscriber("basic-pitch")
    benchmark, _ = build(downloader, [model], max_duration=600.0)

    results = benchmark.run(entries(1), tmp_path / "out", tmp_path / "work")

    assert results[0].download_error is not None
    assert "exceeds limit" in results[0].download_error
    assert model.audio_seen == []
    assert all(not path.exists() for path in downloader.downloaded)


def test_outputs_and_logs_never_contain_the_video_id(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    downloader = FakeDownloader(failing_ids=frozenset({IDS[0]}))
    benchmark, _ = build(downloader, [FakeTranscriber("basic-pitch")])

    with caplog.at_level(logging.DEBUG):
        benchmark.run(entries(), tmp_path / "out", tmp_path / "work")

    names = " ".join(p.name for p in (tmp_path / "out").rglob("*"))
    assert not any(video_id in names for video_id in IDS)
    assert not any(video_id in caplog.text for video_id in IDS)
