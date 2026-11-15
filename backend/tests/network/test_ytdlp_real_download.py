"""Hits YouTube for real. Excluded from CI; run on the VPS with:

    PIANOLA_TEST_VIDEO_URL=<a short video you may use> uv run pytest -m network

Use a short public-domain or your own video: the URL is read from the environment so no
link to a protected song is ever committed.
"""

from __future__ import annotations

import os
import shutil
import wave
from pathlib import Path

import pytest

from pianola.domain.video_url import VideoUrl
from pianola.infrastructure.ytdlp_downloader import YtDlpDownloader

pytestmark = pytest.mark.network

RAW_URL = os.environ.get("PIANOLA_TEST_VIDEO_URL")


@pytest.mark.skipif(not RAW_URL, reason="set PIANOLA_TEST_VIDEO_URL to run")
@pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("deno") is None,
    reason="needs ffmpeg and deno on PATH",
)
def test_real_download_produces_a_mono_wav(tmp_path: Path) -> None:
    assert RAW_URL is not None
    downloader = YtDlpDownloader(
        max_duration_seconds=600.0, proxy_url=os.environ.get("PIANOLA_PROXY_URL")
    )

    audio = downloader.download(VideoUrl.parse(RAW_URL), tmp_path)

    assert audio.duration_seconds > 0
    with wave.open(str(audio.path), "rb") as handle:
        assert handle.getnchannels() == 1
        assert handle.getnframes() > 0
