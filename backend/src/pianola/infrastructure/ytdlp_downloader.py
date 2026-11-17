"""yt-dlp adapter: downloads only the audio of one validated video."""

from __future__ import annotations

import contextlib
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

from pianola.domain.errors import DownloadError, DurationLimitExceededError
from pianola.domain.models import AudioFile, SongSource
from pianola.domain.video_url import VideoUrl

logger = logging.getLogger(__name__)

_AUDIO_BASENAME = "audio"
_SAMPLE_RATE_HZ = "44100"


class _SilentLogger:
    """yt-dlp prints errors, with the video id in them, straight to stderr unless given a logger.

    Failures still reach the caller as exceptions, which ``_scrub`` cleans before they are
    logged or reported.
    """

    def debug(self, msg: str) -> None:
        del msg

    def info(self, msg: str) -> None:
        del msg

    def warning(self, msg: str) -> None:
        del msg

    def error(self, msg: str) -> None:
        del msg


def _default_factory(options: dict[str, Any]) -> Any:
    import yt_dlp

    return yt_dlp.YoutubeDL(options)


class YtDlpDownloader:
    """Needs ffmpeg for the audio conversion and Deno on PATH (yt-dlp's JS runtime)."""

    def __init__(
        self,
        *,
        max_duration_seconds: float,
        proxy_url: str | None = None,
        ydl_factory: Callable[[dict[str, Any]], Any] = _default_factory,
    ) -> None:
        self._max_duration_seconds = max_duration_seconds
        self._proxy_url = proxy_url or None
        self._ydl_factory = ydl_factory

    def download(self, source: SongSource, dest_dir: Path) -> AudioFile:
        if not isinstance(source, VideoUrl):
            raise DownloadError("this downloader only handles YouTube links")
        url = source
        dest_dir.mkdir(parents=True, exist_ok=True)
        try:
            duration = self._probe_duration(url)
            options = self._download_options(dest_dir)
            with contextlib.closing(self._open(options)) as ydl:
                ydl.download([url.canonical])
        except DurationLimitExceededError:
            raise
        except Exception as exc:
            raise DownloadError(_scrub(str(exc), url)) from None

        path = dest_dir / f"{_AUDIO_BASENAME}.wav"
        if not path.exists():
            raise DownloadError("yt-dlp finished but produced no audio file")
        return AudioFile(path=path, duration_seconds=duration)

    def probe(self, video: VideoUrl) -> float:
        """Duration in seconds without downloading; raises when live or over the limit."""
        try:
            return self._probe_duration(video)
        except (DownloadError, DurationLimitExceededError):
            raise
        except Exception as exc:
            raise DownloadError(_scrub(str(exc), video)) from None

    def _probe_duration(self, url: VideoUrl) -> float:
        with contextlib.closing(self._open(self._base_options())) as ydl:
            info = ydl.extract_info(url.canonical, download=False)
        if info.get("is_live"):
            raise DownloadError("live streams are not supported")
        duration = info.get("duration")
        if not isinstance(duration, int | float) or duration <= 0:
            raise DownloadError("could not determine the video duration")
        if duration > self._max_duration_seconds:
            raise DurationLimitExceededError(
                f"{duration:.0f}s exceeds limit of {self._max_duration_seconds:.0f}s"
            )
        return float(duration)

    def _open(self, options: dict[str, Any]) -> Any:
        return self._ydl_factory(options)

    def _base_options(self) -> dict[str, Any]:
        options: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "logger": _SilentLogger(),
            "noplaylist": True,
            "socket_timeout": 30,
            "retries": 3,
        }
        if self._proxy_url:
            options["proxy"] = self._proxy_url
        return options

    def _download_options(self, dest_dir: Path) -> dict[str, Any]:
        return {
            **self._base_options(),
            "format": "bestaudio/best",
            "outtmpl": str(dest_dir / f"{_AUDIO_BASENAME}.%(ext)s"),
            "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}],
            # Mono, 44.1 kHz: enough for both models, and small on disk.
            "postprocessor_args": {"extractaudio": ["-ac", "1", "-ar", _SAMPLE_RATE_HZ]},
        }


def _scrub(message: str, url: VideoUrl) -> str:
    """yt-dlp errors quote the link and the video id; they must not reach logs or reports."""
    cleaned = message.replace(url.canonical, "<video>").replace(url.video_id, "<video>")
    return cleaned.strip().splitlines()[0][:300] if cleaned.strip() else "download failed"
