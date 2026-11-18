from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest

from teclario.application.benchmark import RunBenchmark
from teclario.cli import phase0
from teclario.cli.main import main
from tests.support.fakes import FakeDownloader, FakeSynthesizer, FakeTranscriber, InlineMeter

IDS = [f"{c}{c}{c}{c}{c}{c}{c}{c}{c}{c}{c}" for c in "abcdefghij"]


def write_links(path: Path, count: int = 10) -> None:
    path.write_text("\n".join(f"Song {i} | https://youtu.be/{IDS[i]}" for i in range(count)))


def fake_factory(downloader: FakeDownloader | None = None) -> phase0.BenchmarkFactory:
    def factory(args: argparse.Namespace) -> RunBenchmark:
        return RunBenchmark(
            downloader or FakeDownloader(),
            [FakeTranscriber("basic-pitch"), FakeTranscriber("bytedance")],
            FakeSynthesizer(),
            InlineMeter(),
            max_duration_seconds=args.max_duration,
        )

    return factory


def run_cli(argv: list[str], factory: phase0.BenchmarkFactory | None = None) -> int:
    args = phase0.main_args(argv)
    return phase0.handle(args, factory or fake_factory())


def test_run_writes_results_report_and_a_blank_verdicts_template(tmp_path: Path) -> None:
    links, out = tmp_path / "links.txt", tmp_path / "out"
    write_links(links)

    code = run_cli(["phase0", "run", "--links", str(links), "--out", str(out)])

    assert code == phase0.EXIT_OK
    assert json.loads((out / "results.json").read_text())["schema"] == 1
    assert "INCOMPLETA" in (out / "report.md").read_text()
    template = (out / "verdicts.csv").read_text().splitlines()
    assert template[0] == "song,label,model,recognizable"
    assert len(template) == 1 + 10 * 2


def test_run_removes_the_work_directory_and_downloaded_audio(tmp_path: Path) -> None:
    links, out = tmp_path / "links.txt", tmp_path / "out"
    write_links(links, 2)
    downloader = FakeDownloader()

    run_cli(["phase0", "run", "--links", str(links), "--out", str(out)], fake_factory(downloader))

    assert not (out / ".work").exists()
    assert all(not path.exists() for path in downloader.downloaded)


def test_run_never_overwrites_the_users_verdicts(tmp_path: Path) -> None:
    links, out = tmp_path / "links.txt", tmp_path / "out"
    write_links(links, 2)
    out.mkdir()
    (out / "verdicts.csv").write_text("song,label,model,recognizable\n1,Song 0,basic-pitch,si\n")

    run_cli(["phase0", "run", "--links", str(links), "--out", str(out)])

    assert (out / "verdicts.csv").read_text().endswith("basic-pitch,si\n")


def test_run_rejects_invalid_links_without_echoing_them(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    links = tmp_path / "links.txt"
    links.write_text("https://youtu.be/aaaaaaaaaaa\nhttps://evil.example/watch?v=bbbbbbbbbbb\n")

    code = run_cli(["phase0", "run", "--links", str(links), "--out", str(tmp_path / "out")])

    err = capsys.readouterr().err
    assert code == phase0.EXIT_USAGE
    assert "links.txt:2" in err
    assert "evil.example" not in err
    assert not (tmp_path / "out" / "results.json").exists()


def test_run_reports_a_missing_links_file(tmp_path: Path) -> None:
    code = main(["phase0", "run", "--links", str(tmp_path / "nope.txt"), "--out", str(tmp_path)])

    assert code == phase0.EXIT_USAGE


def test_gate_applies_the_criteria_to_the_users_verdicts(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    links, out = tmp_path / "links.txt", tmp_path / "out"
    write_links(links)
    run_cli(["phase0", "run", "--links", str(links), "--out", str(out)])
    # fake transcribers report 30 s inference for 180 s songs: well inside the budget
    rows = ["song,label,model,recognizable"]
    rows += [f"{i},Song,bytedance,{'si' if i <= 8 else 'no'}" for i in range(1, 11)]
    rows += [f"{i},Song,basic-pitch,no" for i in range(1, 11)]
    (out / "verdicts.csv").write_text("\n".join(rows) + "\n")

    code = run_cli(["phase0", "gate", "--out", str(out)])

    assert code == phase0.EXIT_OK
    assert "Gate 1: PASS" in capsys.readouterr().out
    assert "PASA" in (out / "report.md").read_text()


def test_gate_fails_with_too_few_recognizable_songs(tmp_path: Path) -> None:
    links, out = tmp_path / "links.txt", tmp_path / "out"
    write_links(links)
    run_cli(["phase0", "run", "--links", str(links), "--out", str(out)])
    rows = ["song,label,model,recognizable"]
    rows += [f"{i},Song,{m},{'si' if i <= 3 else 'no'}" for i in range(1, 11) for m in MODELS]
    (out / "verdicts.csv").write_text("\n".join(rows) + "\n")

    assert run_cli(["phase0", "gate", "--out", str(out)]) == phase0.EXIT_NOT_PASSED


def test_gate_is_incomplete_while_verdicts_are_blank(tmp_path: Path) -> None:
    links, out = tmp_path / "links.txt", tmp_path / "out"
    write_links(links)
    run_cli(["phase0", "run", "--links", str(links), "--out", str(out)])

    assert run_cli(["phase0", "gate", "--out", str(out)]) == phase0.EXIT_USAGE


def test_gate_requires_the_files_of_a_previous_run(tmp_path: Path) -> None:
    assert run_cli(["phase0", "gate", "--out", str(tmp_path)]) == phase0.EXIT_USAGE


MODELS = ("basic-pitch", "bytedance")


def test_run_with_audio_dir_processes_local_files_in_name_order(tmp_path: Path) -> None:
    audio_dir, out = tmp_path / "audio", tmp_path / "out"
    audio_dir.mkdir()
    for name in ("b-second.mp3", "a-first.wav", "readme.txt"):
        (audio_dir / name).write_bytes(b"x")

    code = run_cli(["phase0", "run", "--audio-dir", str(audio_dir), "--out", str(out)])

    assert code == phase0.EXIT_OK
    labels = [song["label"] for song in json.loads((out / "results.json").read_text())["songs"]]
    assert labels == ["a-first", "b-second"]
    assert "local files" in (out / "results.json").read_text()
    assert (audio_dir / "a-first.wav").exists(), "the user's audio is never deleted"


def test_run_with_audio_dir_reports_missing_or_empty_folders(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()

    missing = run_cli(
        ["phase0", "run", "--audio-dir", str(tmp_path / "nope"), "--out", str(tmp_path)]
    )
    no_files = run_cli(["phase0", "run", "--audio-dir", str(empty), "--out", str(tmp_path)])

    assert missing == no_files == phase0.EXIT_USAGE


def test_run_requires_exactly_one_audio_origin(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        phase0.main_args(["phase0", "run", "--out", str(tmp_path)])
    with pytest.raises(SystemExit):
        phase0.main_args(
            ["phase0", "run", "--links", "a", "--audio-dir", "b", "--out", str(tmp_path)]
        )
