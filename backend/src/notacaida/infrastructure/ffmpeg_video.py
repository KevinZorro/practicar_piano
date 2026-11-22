"""ffmpeg and ffprobe as the frame source of the video note reader (ADR 0023).

Frames arrive as raw RGB through a pipe, already cropped by ffmpeg to the rows the reader
needs, so a whole song never sits in memory. Timestamps assume a constant frame rate, which
is what YouTube serves.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from collections.abc import Iterator
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from notacaida.domain.errors import VideoReadError

Frames = NDArray[np.uint8]  # (frames, height, width, 3)
_PROBE_TIMEOUT_S = 60
_STDERR_TAIL_CHARS = 300


@dataclass(frozen=True, slots=True)
class VideoInfo:
    width: int
    height: int
    fps: float
    duration_s: float
    #: Timestamp of the first frame (usually 0).
    start_s: float = 0.0


@dataclass(frozen=True, slots=True)
class Crop:
    x: int
    y: int
    width: int
    height: int


class FfmpegFrames:
    """Needs ``ffmpeg`` and ``ffprobe`` on PATH (both ship in the Docker image)."""

    def __init__(self, ffmpeg: str = "ffmpeg", ffprobe: str = "ffprobe") -> None:
        self._ffmpeg = ffmpeg
        self._ffprobe = ffprobe

    def probe(self, path: Path) -> VideoInfo:
        command = [
            self._ffprobe, "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate,start_time,duration"
            ":format=duration", "-of", "json", str(path),
        ]  # fmt: skip
        try:
            done = subprocess.run(  # noqa: S603 - fixed argv, no shell
                command, capture_output=True, check=True, timeout=_PROBE_TIMEOUT_S
            )
            data = json.loads(done.stdout)
            stream = data["streams"][0]
            fps = _rate(stream.get("avg_frame_rate")) or _rate(stream.get("r_frame_rate"))
            duration = float(stream.get("duration") or data["format"]["duration"])
            info = VideoInfo(
                width=int(stream["width"]),
                height=int(stream["height"]),
                fps=fps,
                duration_s=duration,
                start_s=float(stream.get("start_time") or 0.0),
            )
        except subprocess.CalledProcessError as exc:
            raise VideoReadError(f"ffprobe failed: {_tail(exc.stderr)}") from None
        except (OSError, subprocess.TimeoutExpired, ValueError, KeyError, IndexError) as exc:
            raise VideoReadError(f"cannot probe the video: {type(exc).__name__}") from None
        if info.fps <= 0 or info.duration_s <= 0 or info.width <= 0 or info.height <= 0:
            raise VideoReadError("the video reports no frames")
        return info

    def key_frames(self, path: Path, info: VideoInfo, limit: int) -> Frames:
        """Up to ``limit`` key frames spread over the video; only I-frames are decoded."""
        frames = list(self._spread(self.stream(path, info, key_frames_only=True), limit))
        if len(frames) < min(limit, 8):  # few key frames: sample decoded frames instead
            every_s = max(info.duration_s / limit, 1.0 / info.fps)
            frames = list(self._spread(self.stream(path, info, every_s=every_s), limit))
        if not frames:
            raise VideoReadError("the video has no decodable frames")
        return np.stack(frames)

    def stream(
        self,
        path: Path,
        info: VideoInfo,
        *,
        crop: Crop | None = None,
        start_s: float = 0.0,
        duration_s: float | None = None,
        key_frames_only: bool = False,
        every_s: float | None = None,
        batch: int = 32,
    ) -> Iterator[Frames]:
        """Decoded frames in batches, optionally cropped, from ``start_s`` on.

        With neither ``key_frames_only`` nor ``every_s``, frame ``i`` of the stream is at
        ``info.start_s + start_s + i / info.fps``.
        """
        aligned = _even(crop, info) if crop else None
        width, height = (aligned.width, aligned.height) if aligned else (info.width, info.height)
        command = [self._ffmpeg, "-v", "error", "-nostdin"]
        if key_frames_only:
            command += ["-skip_frame", "nokey"]
        if start_s > 0:
            command += ["-ss", f"{start_s:.3f}"]
        command += ["-i", str(path)]
        if duration_s is not None:
            command += ["-t", f"{duration_s:.3f}"]
        filters = (
            [f"crop={aligned.width}:{aligned.height}:{aligned.x}:{aligned.y}"] if aligned else []
        )
        if every_s is not None:
            filters.append(f"fps={1.0 / every_s:.6f}")
        if filters:
            command += ["-vf", ",".join(filters)]
        command += ["-an", "-sn", "-dn", "-fps_mode", "passthrough"]
        command += ["-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
        batches = self._read(command, width, height, batch)
        if crop is None or aligned is None or aligned == crop:
            yield from batches
            return
        rows = slice(crop.y - aligned.y, crop.y - aligned.y + crop.height)
        columns = slice(crop.x - aligned.x, crop.x - aligned.x + crop.width)
        for frames in batches:
            yield frames[:, rows, columns]

    def _read(self, command: list[str], width: int, height: int, batch: int) -> Iterator[Frames]:
        frame_bytes = width * height * 3
        # stderr goes to a file: a full pipe would block ffmpeg while we only read stdout.
        with tempfile.TemporaryFile() as errors:
            process = subprocess.Popen(  # noqa: S603 - fixed argv, no shell
                command, stdout=subprocess.PIPE, stderr=errors
            )
            assert process.stdout is not None  # noqa: S101 - set by PIPE
            try:
                while chunk := process.stdout.read(frame_bytes * batch):
                    count = len(chunk) // frame_bytes
                    if count:
                        data = np.frombuffer(chunk[: count * frame_bytes], dtype=np.uint8)
                        yield data.reshape(count, height, width, 3)
                if process.wait() != 0:
                    errors.seek(0)
                    raise VideoReadError(f"ffmpeg failed: {_tail(errors.read())}")
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
                process.stdout.close()

    @staticmethod
    def _spread(batches: Iterator[Frames], limit: int) -> Iterator[NDArray[np.uint8]]:
        """At most ``limit`` frames evenly spread over the stream, without knowing its length."""
        kept: list[NDArray[np.uint8]] = []
        stride, seen = 1, 0
        for chunk in batches:
            for frame in chunk:
                if seen % stride == 0:
                    kept.append(frame.copy())
                    if len(kept) > 2 * limit:
                        kept = kept[::2]
                        stride *= 2
                seen += 1
        step = max(1, len(kept) // limit) if len(kept) > limit else 1
        yield from kept[::step][:limit]


def _even(crop: Crop, info: VideoInfo) -> Crop:
    """The crop grown to even edges: ffmpeg rounds odd offsets of 4:2:0 video, which would
    shift the picture by a pixel against the plate."""
    x, y = crop.x - crop.x % 2, crop.y - crop.y % 2
    right = min(crop.x + crop.width + (crop.x + crop.width) % 2, info.width)
    bottom = min(crop.y + crop.height + (crop.y + crop.height) % 2, info.height)
    return Crop(x, y, right - x, bottom - y)


def extract_audio(video: Path, wav: Path, ffmpeg: str = "ffmpeg") -> bool:
    """Write the sound of a local video as mono 44.1 kHz WAV; False when it has none."""
    command = [
        ffmpeg, "-v", "error", "-nostdin", "-y", "-i", str(video),
        "-vn", "-ac", "1", "-ar", "44100", str(wav),
    ]  # fmt: skip
    done = subprocess.run(command, capture_output=True, check=False)  # noqa: S603
    return done.returncode == 0 and wav.is_file() and wav.stat().st_size > 1024


def _rate(text: str | None) -> float:
    if not text or text in ("0/0", "0"):
        return 0.0
    try:
        return float(Fraction(text))
    except (ValueError, ZeroDivisionError):
        return 0.0


def _tail(stderr: bytes | None) -> str:
    text = (stderr or b"").decode("utf-8", errors="replace").strip()
    return text[-_STDERR_TAIL_CHARS:] or "no details"
