from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from pianola.domain.errors import DownloadError, DurationLimitExceededError
from pianola.domain.video_url import VideoUrl
from pianola.infrastructure.ytdlp_downloader import YtDlpDownloader

VIDEO_ID = "dQw4w9WgXcQ"
URL = VideoUrl.parse(f"https://youtu.be/{VIDEO_ID}")


class FakeYoutubeDL:
    instances: list[FakeYoutubeDL] = []  # noqa: RUF012

    def __init__(self, options: dict[str, Any], info: dict[str, Any], fail: str | None) -> None:
        self.options = options
        self._info = info
        self._fail = fail
        self.downloaded: list[str] = []
        FakeYoutubeDL.instances.append(self)

    def extract_info(self, url: str, download: bool) -> dict[str, Any]:
        assert download is False
        if self._fail:
            raise RuntimeError(self._fail)
        return self._info

    def download(self, urls: list[str]) -> None:
        self.downloaded.extend(urls)
        Path(self.options["outtmpl"].replace("%(ext)s", "wav")).write_bytes(b"RIFF")

    def close(self) -> None:
        pass


def make(
    tmp_path: Path,
    *,
    info: dict[str, Any] | None = None,
    fail: str | None = None,
    proxy: str | None = None,
    max_duration: float = 600.0,
) -> YtDlpDownloader:
    FakeYoutubeDL.instances = []
    info = info if info is not None else {"duration": 200}
    return YtDlpDownloader(
        max_duration_seconds=max_duration,
        proxy_url=proxy,
        ydl_factory=lambda options: FakeYoutubeDL(options, info, fail),
    )


def test_download_returns_the_audio_file_and_duration(tmp_path: Path) -> None:
    audio = make(tmp_path).download(URL, tmp_path)

    assert audio.path == tmp_path / "audio.wav"
    assert audio.duration_seconds == 200.0


def test_download_only_ever_receives_the_canonical_link_and_never_a_playlist(
    tmp_path: Path,
) -> None:
    make(tmp_path).download(URL, tmp_path)

    downloader_instance = FakeYoutubeDL.instances[-1]
    assert downloader_instance.downloaded == [URL.canonical]
    assert downloader_instance.options["noplaylist"] is True
    assert downloader_instance.options["format"] == "bestaudio/best"


def test_download_extracts_mono_wav_audio(tmp_path: Path) -> None:
    make(tmp_path).download(URL, tmp_path)

    options = FakeYoutubeDL.instances[-1].options
    assert options["postprocessors"] == [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}]
    assert options["postprocessor_args"]["extractaudio"][:2] == ["-ac", "1"]


def test_proxy_is_passed_only_when_configured(tmp_path: Path) -> None:
    make(tmp_path, proxy="socks5://10.8.0.2:1080").download(URL, tmp_path)
    assert all(i.options["proxy"] == "socks5://10.8.0.2:1080" for i in FakeYoutubeDL.instances)

    make(tmp_path).download(URL, tmp_path)
    assert all("proxy" not in i.options for i in FakeYoutubeDL.instances)


def test_empty_proxy_string_means_direct_download(tmp_path: Path) -> None:
    make(tmp_path, proxy="").download(URL, tmp_path)

    assert all("proxy" not in i.options for i in FakeYoutubeDL.instances)


def test_videos_over_the_limit_are_rejected_before_downloading(tmp_path: Path) -> None:
    downloader = make(tmp_path, info={"duration": 1200}, max_duration=600.0)

    with pytest.raises(DurationLimitExceededError, match="exceeds limit"):
        downloader.download(URL, tmp_path)

    assert all(i.downloaded == [] for i in FakeYoutubeDL.instances)


@pytest.mark.parametrize(
    "info", [{"duration": 200, "is_live": True}, {}, {"duration": 0}, {"duration": "long"}]
)
def test_live_streams_and_unknown_durations_are_rejected(
    tmp_path: Path, info: dict[str, Any]
) -> None:
    with pytest.raises(DownloadError):
        make(tmp_path, info=info).download(URL, tmp_path)


def test_download_errors_never_leak_the_link_or_the_video_id(tmp_path: Path) -> None:
    message = f"ERROR: [youtube] {VIDEO_ID}: Sign in to confirm you're not a bot ({URL.canonical})"

    with pytest.raises(DownloadError) as caught:
        make(tmp_path, fail=message).download(URL, tmp_path)

    text = str(caught.value)
    assert VIDEO_ID not in text
    assert "youtube.com" not in text
    assert "Sign in to confirm" in text
    assert caught.value.__cause__ is None


def test_missing_output_file_is_reported(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(FakeYoutubeDL, "download", lambda self, urls: None)

    with pytest.raises(DownloadError, match="no audio file"):
        make(tmp_path).download(URL, tmp_path)
