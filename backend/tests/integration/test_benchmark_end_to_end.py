"""Whole pipeline with real Basic Pitch, synthesizer and subprocess meter.

Only the downloader is replaced (no network): it "downloads" a public-domain melody
rendered on the spot, so no recording is ever stored in the repository.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("pretty_midi")
pytest.importorskip("basic_pitch")

from notacaida.application.benchmark import RunBenchmark
from notacaida.application.links import parse_links
from notacaida.application.report import render_report
from notacaida.domain.models import AudioFile, SongSource
from notacaida.infrastructure.basic_pitch_transcriber import BasicPitchTranscriber
from notacaida.infrastructure.process_meter import SubprocessResourceMeter
from notacaida.infrastructure.synthesizer import AdditiveSynthesizer
from tests.integration.test_basic_pitch_public_domain import (
    NOTE_SECONDS,
    ODE_TO_JOY,
    write_reference_midi,
)

pytestmark = pytest.mark.integration


class PublicDomainDownloader:
    def __init__(self) -> None:
        self.downloaded: list[Path] = []

    def download(self, source: SongSource, dest_dir: Path) -> AudioFile:
        write_reference_midi(dest_dir / "ref.mid")
        AdditiveSynthesizer().render(dest_dir / "ref.mid", dest_dir / "audio.wav")
        self.downloaded.append(dest_dir / "audio.wav")
        return AudioFile(dest_dir / "audio.wav", len(ODE_TO_JOY) * NOTE_SECONDS)


def test_benchmark_runs_real_basic_pitch_and_cleans_up(tmp_path: Path) -> None:
    downloader = PublicDomainDownloader()
    benchmark = RunBenchmark(
        downloader,
        [BasicPitchTranscriber()],
        AdditiveSynthesizer(),
        SubprocessResourceMeter(),
        max_duration_seconds=600.0,
    )
    entries, issues = parse_links("Ode to Joy | https://youtu.be/aaaaaaaaaaa")
    assert issues == []

    songs = benchmark.run(entries, tmp_path / "out", tmp_path / "work")

    run = songs[0].runs[0]
    assert run.succeeded, run.error
    assert run.midi_path is not None and run.midi_path.stat().st_size > 0
    assert run.wav_path is not None and run.wav_path.stat().st_size > 1000
    assert run.usage is not None and run.usage.peak_rss_mb > 50
    assert run.inference_seconds is not None and run.inference_seconds > 0
    assert all(not path.exists() for path in downloader.downloaded)
    report = render_report(songs, {"platform": "test"})
    assert "basic-pitch" in report
    assert "Ode to Joy" in report
