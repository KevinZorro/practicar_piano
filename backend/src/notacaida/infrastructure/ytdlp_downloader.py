"""yt-dlp adapter: downloads the audio of one validated video, or its picture (ADR 0023)."""

from __future__ import annotations

import contextlib
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

from notacaida.application.ports import SongMedia
from notacaida.domain.errors import DownloadError, DurationLimitExceededError
from notacaida.domain.models import AudioFile, SongSource, VideoFile
from notacaida.domain.video_url import VideoUrl

logger = logging.getLogger(__name__)

_AUDIO_BASENAME = "audio"
_VIDEO_BASENAME = "video"
_SAMPLE_RATE_HZ = "44100"
_BYTES_PER_MB = 1024 * 1024
_PARTIAL_SUFFIXES = (".part", ".ytdl")  # what yt-dlp leaves while (or after failing) writing
DEFAULT_VIDEO_HEIGHT = 480


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
        video_height: int = DEFAULT_VIDEO_HEIGHT,
    ) -> None:
        self._max_duration_seconds = max_duration_seconds
        self._proxy_url = proxy_url or None
        self._ydl_factory = ydl_factory
        self._video_height = video_height

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

    def download_video(self, source: SongSource, dest_dir: Path) -> VideoFile:
        """Get only the picture, at most ``video_height`` rows and 30 frames per second.

        H.264 is preferred: it is the cheapest to decode on the VPS. When that download fails
        (YouTube answered 403 to one song on the VPS), the 360p file with picture and sound is
        tried once: another format, which may still be served. Raises like ``download``.
        """
        if not isinstance(source, VideoUrl):
            raise DownloadError("this downloader only handles YouTube links")
        dest_dir.mkdir(parents=True, exist_ok=True)
        try:
            duration = self._probe_duration(source)
        except DurationLimitExceededError:
            raise
        except Exception as exc:
            raise DownloadError(_scrub(str(exc), source)) from None
        for attempt, options in enumerate(
            (self._video_options(dest_dir), self._video_options(dest_dir, progressive=True))
        ):
            try:
                with contextlib.closing(self._open(options)) as ydl:
                    ydl.download([source.canonical])
                break
            except Exception as exc:
                if attempt:
                    raise DownloadError(_scrub(str(exc), source)) from None
                for leftover in dest_dir.glob(f"{_VIDEO_BASENAME}.*"):
                    leftover.unlink(missing_ok=True)  # left by the failed attempt
        found = sorted(
            p for p in dest_dir.glob(f"{_VIDEO_BASENAME}.*") if p.suffix not in _PARTIAL_SUFFIXES
        )
        if not found:
            raise DownloadError("yt-dlp finished but produced no video file")
        path = found[0]
        return VideoFile(path, duration, path.stat().st_size / _BYTES_PER_MB)

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

    def _video_options(self, dest_dir: Path, *, progressive: bool = False) -> dict[str, Any]:
        height = self._video_height
        picture_only = (
            f"bestvideo[height<={height}][fps<=30][vcodec^=avc1]"
            f"/bestvideo[height<={height}][fps<=30]"
            f"/bestvideo[height<={height}]/best[height<={height}]"
        )
        return {
            **self._base_options(),
            # 18 is the 360p MP4 with picture and sound: the reader ignores the sound
            "format": f"18/best[height<={height}]" if progressive else picture_only,
            "outtmpl": str(dest_dir / f"{_VIDEO_BASENAME}.%(ext)s"),
        }


class YtDlpMediaSource:
    """Picture and sound of a YouTube video, for the video reading benchmark."""

    def __init__(self, downloader: YtDlpDownloader) -> None:
        self._downloader = downloader

    def fetch(self, source: SongSource, dest_dir: Path) -> SongMedia:
        video = self._downloader.download_video(source, dest_dir / "picture")
        audio = self._downloader.download(source, dest_dir / "sound")
        return SongMedia(video=video, audio=audio)


def _scrub(message: str, url: VideoUrl) -> str:
    """yt-dlp errors quote the link and the video id; they must not reach logs or reports."""
    cleaned = message.replace(url.canonical, "<video>").replace(url.video_id, "<video>")
    return cleaned.strip().splitlines()[0][:300] if cleaned.strip() else "download failed"
