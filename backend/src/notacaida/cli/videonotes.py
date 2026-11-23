"""``notacaida videonotes run``: the ADR 0023 prototype from the command line.

Reads the falling notes of each video and compares them with the audio transcriptions.
Links are never echoed: songs are named by their label and a short fingerprint.
"""

from __future__ import annotations

import argparse
import datetime
import os
import platform
import shutil
import sys
from collections.abc import Callable
from importlib import metadata
from pathlib import Path

from notacaida.application.links import SongEntry, parse_links
from notacaida.application.ports import SongMediaSource, Transcriber
from notacaida.application.video_benchmark import BenchmarkTools, CompareVideoReading
from notacaida.application.video_report import dump_video_results, render_video_report
from notacaida.domain.models import LocalAudio
from notacaida.infrastructure.basic_pitch_transcriber import BasicPitchTranscriber
from notacaida.infrastructure.bytedance_transcriber import DEFAULT_CHECKPOINT, ByteDanceTranscriber
from notacaida.infrastructure.midi_reader import PrettyMidiReader
from notacaida.infrastructure.midi_writer import PrettyMidiWriter
from notacaida.infrastructure.octave_check import AudioOctaveEstimator
from notacaida.infrastructure.process_meter import SubprocessResourceMeter
from notacaida.infrastructure.synthesizer import AdditiveSynthesizer
from notacaida.infrastructure.ytdlp_downloader import (
    DEFAULT_VIDEO_HEIGHT,
    YtDlpDownloader,
    YtDlpMediaSource,
)

EXIT_OK = 0
EXIT_USAGE = 2
RESULTS_FILE = "results.json"
REPORT_FILE = "report.md"
MODEL_CHOICES = ("basic-pitch", "bytedance")
DEFAULT_MAX_DURATION_SECONDS = 600.0

BenchmarkFactory = Callable[[argparse.Namespace], CompareVideoReading]


def register(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    videonotes = subparsers.add_parser(
        "videonotes", help="ADR 0023 prototype: read the falling notes of piano videos"
    )
    commands = videonotes.add_subparsers(dest="videonotes_command", required=True)
    run = commands.add_parser("run", help="read each video and compare it with the audio")
    origin = run.add_mutually_exclusive_group(required=True)
    origin.add_argument("--links", type=Path, help="file with one YouTube link per line")
    origin.add_argument(
        "--video-dir",
        type=Path,
        help="folder with video files you already have; a same-named .mid is the truth",
    )
    run.add_argument("--out", type=Path, required=True, help="output directory (git-ignored)")
    run.add_argument(
        "--models",
        nargs="*",
        choices=MODEL_CHOICES,
        default=list(MODEL_CHOICES),
        help="audio models to compare with (none: only read the videos)",
    )
    run.add_argument(
        "--reuse",
        nargs="*",
        type=Path,
        metavar="DIR",
        help="take the model MIDI an earlier run left in --out, or in each DIR (such as the "
        "phase0 output), instead of transcribing the song again",
    )
    run.add_argument(
        "--max-height",
        type=int,
        default=DEFAULT_VIDEO_HEIGHT,
        help="tallest picture to download, in pixels",
    )
    run.add_argument(
        "--max-duration",
        type=float,
        default=float(
            os.environ.get("NOTACAIDA_MAX_DURATION_SECONDS", DEFAULT_MAX_DURATION_SECONDS)
        ),
        help="reject songs longer than this many seconds",
    )
    run.add_argument(
        "--bytedance-checkpoint",
        type=Path,
        default=Path(os.environ.get("NOTACAIDA_BYTEDANCE_CHECKPOINT", str(DEFAULT_CHECKPOINT))),
    )


def build_benchmark(args: argparse.Namespace) -> CompareVideoReading:
    # numpy comes with the synth extra: the CLI must start without it, like phase0 does.
    from notacaida.infrastructure.falling_notes_reader import FallingNotesReader
    from notacaida.infrastructure.local_video import LocalVideoMedia
    from notacaida.infrastructure.roll_image import PngRollPlotter

    transcribers: list[Transcriber] = []
    if "basic-pitch" in args.models:
        transcribers.append(BasicPitchTranscriber())
    if "bytedance" in args.models:
        transcribers.append(ByteDanceTranscriber(checkpoint_path=args.bytedance_checkpoint))
    midi_reader = PrettyMidiReader()
    media: SongMediaSource = (
        LocalVideoMedia(max_duration_seconds=args.max_duration, midi_reader=midi_reader)
        if args.video_dir
        else YtDlpMediaSource(
            YtDlpDownloader(
                max_duration_seconds=args.max_duration,
                proxy_url=os.environ.get("NOTACAIDA_PROXY_URL") or None,
                video_height=args.max_height,
            )
        )
    )
    tools = BenchmarkTools(
        midi_reader=midi_reader,
        midi_writer=PrettyMidiWriter(),
        meter=SubprocessResourceMeter(),
        synthesizer=AdditiveSynthesizer(),
        plotter=PngRollPlotter(),
        octave=AudioOctaveEstimator(),
    )
    return CompareVideoReading(
        media, FallingNotesReader(), transcribers, tools, reuse_from=args.reuse
    )


def handle(args: argparse.Namespace, benchmark_factory: BenchmarkFactory = build_benchmark) -> int:
    entries = _load_entries(args)
    if entries is None:
        return EXIT_USAGE
    tools = ("ffmpeg", "ffprobe") if args.video_dir else ("ffmpeg", "ffprobe", "deno")
    missing = [tool for tool in tools if shutil.which(tool) is None]
    if missing and benchmark_factory is build_benchmark:
        _err(f"required tools not found on PATH: {', '.join(missing)}")
        return EXIT_USAGE
    out_dir: Path = args.out
    work_dir = out_dir / ".work"
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        songs = benchmark_factory(args).run(entries, out_dir, work_dir)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)  # video and audio never outlive the run
    environment = _environment(local=bool(args.video_dir))
    (out_dir / RESULTS_FILE).write_text(dump_video_results(songs, environment), encoding="utf-8")
    (out_dir / REPORT_FILE).write_text(render_video_report(songs, environment), encoding="utf-8")
    sys.stdout.write(f"Done. Report: {out_dir / REPORT_FILE}\n")
    return EXIT_OK


def _load_entries(args: argparse.Namespace) -> list[SongEntry] | None:
    """Songs to process, or None after reporting a usage error (never echoing links)."""
    if args.video_dir:
        from notacaida.infrastructure.local_video import discover_video_files  # needs numpy

        if not args.video_dir.is_dir():
            _err(f"video folder not found: {args.video_dir}")
            return None
        files = discover_video_files(args.video_dir)
        if not files:
            _err(f"no video files in {args.video_dir}")
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


def _environment(*, local: bool) -> dict[str, str]:
    return {
        "fecha": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d %H:%M UTC"),
        "plataforma": f"{platform.system()} {platform.machine()}",
        "cpus": str(os.cpu_count()),
        "python": platform.python_version(),
        "yt-dlp": _version("yt-dlp"),
        "numpy": _version("numpy"),
        "torch": _version("torch"),
        "origen": "archivos locales" if local else _origin(),
    }


def _origin() -> str:
    return "YouTube por el proxy" if os.environ.get("NOTACAIDA_PROXY_URL") else "YouTube directo"


def _version(package: str) -> str:
    try:
        return metadata.version(package)
    except metadata.PackageNotFoundError:
        return "no instalado"


def _err(message: str) -> None:
    sys.stderr.write(f"notacaida: {message}\n")
