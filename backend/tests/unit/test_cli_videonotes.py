from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest

from notacaida.application.video_benchmark import BenchmarkTools, CompareVideoReading
from notacaida.cli import videonotes
from notacaida.cli.main import main, main_args
from tests.support.fakes import (
    FakeMidiReader,
    FakeMidiWriter,
    FakeRollPlotter,
    FakeSongMedia,
    FakeSynthesizer,
    FakeTranscriber,
    FakeVideoReader,
    InlineMeter,
)

IDS = [c * 11 for c in "abcdefghij"]


def fake_factory(media: FakeSongMedia | None = None) -> videonotes.BenchmarkFactory:
    def factory(args: argparse.Namespace) -> CompareVideoReading:
        tools = BenchmarkTools(
            midi_reader=FakeMidiReader(),
            midi_writer=FakeMidiWriter(),
            meter=InlineMeter(),
            synthesizer=FakeSynthesizer(),
            plotter=FakeRollPlotter(),
        )
        models = [FakeTranscriber(name) for name in args.models]
        return CompareVideoReading(media or FakeSongMedia(), FakeVideoReader(), models, tools)

    return factory


def run_cli(argv: list[str], factory: videonotes.BenchmarkFactory | None = None) -> int:
    return videonotes.handle(main_args(argv), factory or fake_factory())


def test_a_folder_of_videos_gives_a_report_and_results(tmp_path: Path) -> None:
    videos, out = tmp_path / "videos", tmp_path / "out"
    videos.mkdir()
    for name in ("b-second.webm", "a-first.mp4", "notes.txt"):
        (videos / name).write_bytes(b"x")

    code = run_cli(["videonotes", "run", "--video-dir", str(videos), "--out", str(out)])

    assert code == videonotes.EXIT_OK
    songs = json.loads((out / "results.json").read_text())["songs"]
    assert [s["label"] for s in songs] == ["a-first", "b-second"]
    assert all(len(s["models"]) == 2 for s in songs)
    report = (out / "report.md").read_text()
    assert "Videos con notas que caen leídos: **2 de 2**" in report
    assert "archivos locales" in report


def test_links_are_never_written_to_the_report_or_the_results(tmp_path: Path) -> None:
    links, out = tmp_path / "links.txt", tmp_path / "out"
    links.write_text("\n".join(f"Song {i} | https://youtu.be/{IDS[i]}" for i in range(3)))
    media = FakeSongMedia()

    code = run_cli(
        ["videonotes", "run", "--links", str(links), "--out", str(out), "--models"],
        fake_factory(media),
    )

    assert code == videonotes.EXIT_OK
    written = (out / "report.md").read_text() + (out / "results.json").read_text()
    assert "Song 2" in written
    assert not any(video_id in written for video_id in IDS)
    assert "youtu" not in written
    assert not (out / ".work").exists()
    assert all(not path.exists() for path in media.fetched)


def test_invalid_links_are_reported_by_line_without_echoing_them(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    links = tmp_path / "links.txt"
    links.write_text(f"https://youtu.be/{IDS[0]}\nhttps://evil.example/watch?v={IDS[1]}\n")

    code = run_cli(["videonotes", "run", "--links", str(links), "--out", str(tmp_path / "out")])

    err = capsys.readouterr().err
    assert code == videonotes.EXIT_USAGE
    assert "links.txt:2" in err
    assert "evil.example" not in err
    assert not (tmp_path / "out" / "report.md").exists()


def test_missing_or_empty_inputs_are_usage_errors(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    out = str(tmp_path / "out")

    assert main(["videonotes", "run", "--links", str(tmp_path / "nope.txt"), "--out", out]) == 2
    assert main(["videonotes", "run", "--video-dir", str(tmp_path / "nope"), "--out", out]) == 2
    assert main(["videonotes", "run", "--video-dir", str(empty), "--out", out]) == 2


def test_the_options_have_sensible_defaults() -> None:
    args = main_args(["videonotes", "run", "--video-dir", "v", "--out", "o"])
    bare = main_args(["videonotes", "run", "--links", "l", "--out", "o", "--models"])
    sized = main_args(["videonotes", "run", "--links", "l", "--out", "o", "--max-height", "360"])
    reusing = main_args(["videonotes", "run", "--links", "l", "--out", "o", "--reuse"])
    phase0 = main_args(["videonotes", "run", "--links", "l", "--out", "o", "--reuse", "/data/out"])

    assert args.models == ["basic-pitch", "bytedance"]
    assert args.max_height == 480
    assert args.reuse is None  # a run transcribes again unless asked not to
    assert bare.models == []
    assert sized.max_height == 360
    assert reusing.reuse == []  # only what --out already holds
    assert phase0.reuse == [Path("/data/out")]


def test_the_real_benchmark_is_wired_without_touching_the_network(tmp_path: Path) -> None:
    local = main_args(["videonotes", "run", "--video-dir", "v", "--out", "o", "--models"])
    remote = main_args(["videonotes", "run", "--links", "l", "--out", "o"])

    assert isinstance(videonotes.build_benchmark(local), CompareVideoReading)
    assert isinstance(videonotes.build_benchmark(remote), CompareVideoReading)
