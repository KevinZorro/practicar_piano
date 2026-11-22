"""Videos the user already has (or synthetic test videos), for the video reading benchmark.

The sound comes out of the video file itself. A MIDI file with the same name next to the
video holds the notes it was drawn from (synthetic videos), and is then used as the truth.
"""

from __future__ import annotations

from pathlib import Path

from notacaida.application.ports import MidiNoteReader, SongMedia
from notacaida.domain.errors import DownloadError, DurationLimitExceededError
from notacaida.domain.models import AudioFile, LocalAudio, SongSource, VideoFile
from notacaida.infrastructure.ffmpeg_video import FfmpegFrames, extract_audio

VIDEO_SUFFIXES = frozenset({".mp4", ".webm", ".mkv", ".mov"})
_BYTES_PER_MB = 1024 * 1024


def discover_video_files(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in VIDEO_SUFFIXES)


class LocalVideoMedia:
    def __init__(
        self,
        *,
        max_duration_seconds: float,
        midi_reader: MidiNoteReader,
        frames: FfmpegFrames | None = None,
    ) -> None:
        self._max_duration_seconds = max_duration_seconds
        self._midi_reader = midi_reader
        self._frames = frames or FfmpegFrames()

    def fetch(self, source: SongSource, dest_dir: Path) -> SongMedia:
        if not isinstance(source, LocalAudio):
            raise DownloadError("this source only handles local video files")
        path = source.path
        try:
            info = self._frames.probe(path)
        except Exception as exc:  # VideoReadError or an unreadable file
            raise DownloadError(f"cannot open the video: {exc}") from None
        if info.duration_s > self._max_duration_seconds:
            raise DurationLimitExceededError(
                f"{info.duration_s:.0f}s exceeds limit of {self._max_duration_seconds:.0f}s"
            )
        video = VideoFile(path, info.duration_s, path.stat().st_size / _BYTES_PER_MB)
        dest_dir.mkdir(parents=True, exist_ok=True)
        wav = dest_dir / "audio.wav"
        audio = AudioFile(wav, info.duration_s) if extract_audio(path, wav) else None
        truth_path = path.with_suffix(".mid")
        truth = self._midi_reader.read(truth_path) if truth_path.is_file() else None
        return SongMedia(video=video, audio=audio, truth=truth)
