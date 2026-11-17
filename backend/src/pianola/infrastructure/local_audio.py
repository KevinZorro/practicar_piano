"""Audio the user already has: the study's fallback when YouTube blocks the VPS.

Each file is converted (never moved or deleted) into the work directory with ffmpeg,
exactly as the YouTube path delivers it: mono 44.1 kHz WAV.
"""

from __future__ import annotations

import subprocess  # fixed argument list, never a shell
import wave
from collections.abc import Callable
from pathlib import Path
from typing import Any

from pianola.domain.errors import DownloadError, DurationLimitExceededError
from pianola.domain.models import AudioFile, LocalAudio, SongSource

AUDIO_EXTENSIONS = frozenset({".wav", ".mp3", ".m4a", ".opus", ".ogg", ".flac", ".webm", ".aac"})
_SAMPLE_RATE_HZ = "44100"
_CONVERT_TIMEOUT_SECONDS = 600


def discover_audio_files(directory: Path) -> list[Path]:
    """Audio files directly inside ``directory``, in name order (that order is the song index)."""
    return sorted(
        (p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS),
        key=lambda p: p.name.lower(),
    )


class LocalAudioImporter:
    def __init__(
        self,
        *,
        max_duration_seconds: float,
        ffmpeg: str = "ffmpeg",
        runner: Callable[..., Any] = subprocess.run,
    ) -> None:
        self._max_duration_seconds = max_duration_seconds
        self._ffmpeg = ffmpeg
        self._runner = runner

    def download(self, source: SongSource, dest_dir: Path) -> AudioFile:
        if not isinstance(source, LocalAudio):
            raise DownloadError("this importer only handles local audio files")
        dest_dir.mkdir(parents=True, exist_ok=True)
        target = dest_dir / "audio.wav"
        command = [
            self._ffmpeg,
            *("-nostdin", "-y", "-loglevel", "error"),
            *("-i", str(source.path.resolve())),
            *("-vn", "-ac", "1", "-ar", _SAMPLE_RATE_HZ),
            str(target),
        ]
        try:
            result = self._runner(
                command,
                capture_output=True,
                text=True,
                timeout=_CONVERT_TIMEOUT_SECONDS,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise DownloadError(f"ffmpeg could not run: {type(exc).__name__}") from exc
        if result.returncode != 0 or not target.exists():
            first_line = (result.stderr or "").strip().splitlines()[:1]
            reason = first_line[0] if first_line else "unknown error"
            raise DownloadError(f"ffmpeg could not read the file: {reason}"[:300])
        duration = _wav_duration(target)
        if duration > self._max_duration_seconds:
            raise DurationLimitExceededError(
                f"{duration:.0f}s exceeds limit of {self._max_duration_seconds:.0f}s"
            )
        return AudioFile(path=target, duration_seconds=duration)


def _wav_duration(path: Path) -> float:
    try:
        with wave.open(str(path), "rb") as handle:
            return handle.getnframes() / handle.getframerate()
    except (wave.Error, EOFError) as exc:
        raise DownloadError("converted audio is not a valid WAV file") from exc
