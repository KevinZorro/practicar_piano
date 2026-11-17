"""``pianola phase0 run | gate``: the gate-1 benchmark from the command line."""

from __future__ import annotations

import argparse
import datetime
import logging
import os
import platform
import shutil
import sys
from collections.abc import Callable, Sequence
from importlib import metadata
from pathlib import Path

from pianola.application.benchmark import RunBenchmark
from pianola.application.links import SongEntry, parse_links
from pianola.application.ports import Transcriber
from pianola.application.report import parse_verdicts, render_report, render_verdicts_template
from pianola.application.results_store import dump_results, load_results
from pianola.domain.gate import GateStatus, evaluate_gate
from pianola.domain.models import LocalAudio
from pianola.infrastructure.basic_pitch_transcriber import BasicPitchTranscriber
from pianola.infrastructure.bytedance_transcriber import DEFAULT_CHECKPOINT, ByteDanceTranscriber
from pianola.infrastructure.local_audio import LocalAudioImporter, discover_audio_files
from pianola.infrastructure.process_meter import SubprocessResourceMeter
from pianola.infrastructure.synthesizer import AdditiveSynthesizer
from pianola.infrastructure.ytdlp_downloader import YtDlpDownloader

EXIT_OK = 0
EXIT_NOT_PASSED = 1
EXIT_USAGE = 2

RESULTS_FILE = "results.json"
REPORT_FILE = "report.md"
VERDICTS_FILE = "verdicts.csv"
MODEL_CHOICES = ("basic-pitch", "bytedance")
DEFAULT_MAX_DURATION_SECONDS = 600.0

BenchmarkFactory = Callable[[argparse.Namespace], RunBenchmark]


def register(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    phase0 = subparsers.add_parser("phase0", help="gate 1 benchmark (download + models)")
    commands = phase0.add_subparsers(dest="phase0_command", required=True)

    run = commands.add_parser("run", help="download, transcribe, synthesize and report")
    origin = run.add_mutually_exclusive_group(required=True)
    origin.add_argument("--links", type=Path, help="file with one YouTube link per line")
    origin.add_argument(
        "--audio-dir", type=Path, help="folder with audio files you already have (no download)"
    )
    run.add_argument("--out", type=Path, required=True, help="output directory (git-ignored)")
    run.add_argument(
        "--models", nargs="+", choices=MODEL_CHOICES, default=list(MODEL_CHOICES), help="models"
    )
    run.add_argument(
        "--max-duration",
        type=float,
        default=float(os.environ.get("PIANOLA_MAX_DURATION_SECONDS", DEFAULT_MAX_DURATION_SECONDS)),
        help="reject songs longer than this many seconds",
    )
    run.add_argument(
        "--bytedance-checkpoint",
        type=Path,
        default=Path(os.environ.get("PIANOLA_BYTEDANCE_CHECKPOINT", str(DEFAULT_CHECKPOINT))),
    )

    gate = commands.add_parser("gate", help="apply the gate criteria to a finished run")
    gate.add_argument("--out", type=Path, required=True, help="directory used by `run`")
    gate.add_argument("--verdicts", type=Path, help=f"default: <out>/{VERDICTS_FILE}")


def build_benchmark(args: argparse.Namespace) -> RunBenchmark:
    transcribers: list[Transcriber] = []
    if "basic-pitch" in args.models:
        transcribers.append(BasicPitchTranscriber())
    if "bytedance" in args.models:
        transcribers.append(ByteDanceTranscriber(checkpoint_path=args.bytedance_checkpoint))
    provider: LocalAudioImporter | YtDlpDownloader = (
        LocalAudioImporter(max_duration_seconds=args.max_duration)
        if args.audio_dir
        else YtDlpDownloader(
            max_duration_seconds=args.max_duration,
            proxy_url=os.environ.get("PIANOLA_PROXY_URL") or None,
        )
    )
    return RunBenchmark(
        provider,
        transcribers,
        AdditiveSynthesizer(),
        SubprocessResourceMeter(),
        max_duration_seconds=args.max_duration,
    )


def handle(args: argparse.Namespace, benchmark_factory: BenchmarkFactory = build_benchmark) -> int:
    if args.phase0_command == "run":
        return _run(args, benchmark_factory)
    return _gate(args)


def _run(args: argparse.Namespace, benchmark_factory: BenchmarkFactory) -> int:
    entries = _load_entries(args)
    if entries is None:
        return EXIT_USAGE
    if (missing := _missing_tools(local=bool(args.audio_dir))) and (
        benchmark_factory is build_benchmark
    ):
        _err(f"required tools not found on PATH: {', '.join(missing)}")
        return EXIT_USAGE

    out_dir: Path = args.out
    work_dir = out_dir / ".work"
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        songs = benchmark_factory(args).run(entries, out_dir, work_dir)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)  # the audio never outlives the run

    environment = _environment(local=bool(args.audio_dir))
    (out_dir / RESULTS_FILE).write_text(dump_results(songs, environment), encoding="utf-8")
    verdicts_path = out_dir / VERDICTS_FILE
    if not verdicts_path.exists():  # never overwrite the user's by-ear verdicts
        verdicts_path.write_text(render_verdicts_template(songs), encoding="utf-8")
    verdicts = parse_verdicts(verdicts_path.read_text(encoding="utf-8"))
    (out_dir / REPORT_FILE).write_text(
        render_report(songs, environment, verdicts=verdicts or None), encoding="utf-8"
    )
    sys.stdout.write(
        f"Done. Listen to the WAV files in {out_dir}, fill {verdicts_path}, "
        f"then run: pianola phase0 gate --out {out_dir}\n"
    )
    return EXIT_OK


def _gate(args: argparse.Namespace) -> int:
    results_path = args.out / RESULTS_FILE
    verdicts_path = args.verdicts or args.out / VERDICTS_FILE
    for path in (results_path, verdicts_path):
        if not path.is_file():
            _err(f"file not found: {path}")
            return EXIT_USAGE
    songs, environment = load_results(results_path.read_text(encoding="utf-8"))
    try:
        verdicts = parse_verdicts(verdicts_path.read_text(encoding="utf-8"))
    except ValueError as exc:
        _err(str(exc))
        return EXIT_USAGE
    result = evaluate_gate(songs, verdicts)
    (args.out / REPORT_FILE).write_text(
        render_report(songs, environment, verdicts=verdicts), encoding="utf-8"
    )
    sys.stdout.write(f"Gate 1: {result.status.value} (report: {args.out / REPORT_FILE})\n")
    if result.status is GateStatus.PASS:
        return EXIT_OK
    return EXIT_USAGE if result.status is GateStatus.INCOMPLETE else EXIT_NOT_PASSED


def _load_entries(args: argparse.Namespace) -> list[SongEntry] | None:
    """Songs to process, or None after reporting a usage error (never echoing links)."""
    if args.audio_dir:
        if not args.audio_dir.is_dir():
            _err(f"audio folder not found: {args.audio_dir}")
            return None
        files = discover_audio_files(args.audio_dir)
        if not files:
            _err(f"no audio files in {args.audio_dir}")
            return None
        return [SongEntry(i, f.stem[:80], LocalAudio(f)) for i, f in enumerate(files, start=1)]
    if not args.links.is_file():
        _err(f"links file not found: {args.links}")
        return None
    entries, issues = parse_links(args.links.read_text(encoding="utf-8"))
    for issue in issues:  # line numbers only: links never go to the terminal
        _err(f"{args.links}:{issue.line_number}: {issue.reason}")
    if issues or not entries:
        _err("fix the links file and run again" if issues else "no links to process")
        return None
    return entries


def _missing_tools(*, local: bool) -> list[str]:
    tools = ("ffmpeg",) if local else ("ffmpeg", "deno")
    return [tool for tool in tools if shutil.which(tool) is None]


def _environment(*, local: bool) -> dict[str, str]:
    return {
        "date": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d %H:%M UTC"),
        "platform": f"{platform.system()} {platform.machine()}",
        "python": platform.python_version(),
        "cpus": str(os.cpu_count()),
        "yt-dlp": _version("yt-dlp"),
        "basic-pitch": _version("basic-pitch"),
        "torch": _version("torch"),
        "audio": _audio_origin(local),
    }


def _audio_origin(local: bool) -> str:
    if local:
        return "local files (no download)"
    return "YouTube via proxy" if os.environ.get("PIANOLA_PROXY_URL") else "YouTube direct"


def _version(package: str) -> str:
    try:
        return metadata.version(package)
    except metadata.PackageNotFoundError:
        return "not installed"


def _err(message: str) -> None:
    sys.stderr.write(f"pianola: {message}\n")


def configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stderr,
    )


def main_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="pianola")
    parser.add_argument("-v", "--verbose", action="store_true")
    register(parser.add_subparsers(dest="command", required=True))
    return parser.parse_args(argv)
