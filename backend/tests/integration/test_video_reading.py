"""The video reader with the real ffmpeg: decoding, cropping and a synthetic song end to end."""

from __future__ import annotations

import json
import shutil
import wave
from pathlib import Path

import numpy as np
import pytest

from notacaida.cli.main import main
from notacaida.domain.agreement import agreement
from notacaida.domain.models import VideoFile
from notacaida.infrastructure.falling_notes_reader import FallingNotesReader
from notacaida.infrastructure.ffmpeg_video import Crop, FfmpegFrames, extract_audio
from tests.support.falling_video import Style, encode, render_frames
from tests.support.pieces import ode_to_joy

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
        reason="needs ffmpeg and ffprobe",
    ),
]

STYLE = Style("test", width=640, height=360, fall_px_s=180.0, crf=20)
NOTES = tuple(n for n in ode_to_joy() if n.end_s < 9.0)


@pytest.fixture(scope="module")
def silent_video(tmp_path_factory: pytest.TempPathFactory) -> Path:
    path = tmp_path_factory.mktemp("video") / "silent.mp4"
    encode(render_frames(NOTES, STYLE, 10.0), STYLE, path)
    return path


def test_probe_reports_size_rate_and_length(silent_video: Path) -> None:
    info = FfmpegFrames().probe(silent_video)

    assert (info.width, info.height) == (640, 360)
    assert info.fps == pytest.approx(30.0)
    assert info.duration_s == pytest.approx(10.0, abs=0.1)


def test_a_crop_with_odd_edges_matches_the_full_frame_pixel_for_pixel(silent_video: Path) -> None:
    frames = FfmpegFrames()
    info = frames.probe(silent_video)
    crop = Crop(x=13, y=201, width=101, height=51)

    full = np.concatenate(list(frames.stream(silent_video, info, duration_s=1.0)))
    cropped = np.concatenate(list(frames.stream(silent_video, info, crop=crop, duration_s=1.0)))

    assert full.shape == (30, 360, 640, 3)
    assert np.array_equal(cropped, full[:, 201:252, 13:114])


def test_key_frames_are_spread_and_limited(silent_video: Path) -> None:
    frames = FfmpegFrames()
    info = frames.probe(silent_video)

    plate_frames = frames.key_frames(silent_video, info, limit=12)

    assert 8 <= plate_frames.shape[0] <= 12
    assert plate_frames.shape[1:] == (360, 640, 3)


def test_only_a_video_with_sound_gives_audio(silent_video: Path, tmp_path: Path) -> None:
    wav = tmp_path / "tone.wav"
    with wave.open(str(wav), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(22050)
        tone = 8000 * np.sin(2 * np.pi * 440 * np.arange(22050 * 3) / 22050)
        out.writeframes(tone.astype("<i2").tobytes())
    sounding = tmp_path / "sounding.mp4"
    encode(render_frames(NOTES[:4], STYLE, 3.0), STYLE, sounding, audio=wav)

    assert not extract_audio(silent_video, tmp_path / "none.wav")
    assert extract_audio(sounding, tmp_path / "some.wav")
    with wave.open(str(tmp_path / "some.wav"), "rb") as extracted:
        assert (extracted.getnchannels(), extracted.getframerate()) == (1, 44100)


def test_the_reader_gets_the_notes_back_from_a_compressed_video(silent_video: Path) -> None:
    reading = FallingNotesReader().read(VideoFile(silent_video, 10.0))

    assert reading.keyboard == "88 teclas, A0-C8"
    keys = reading.preferred_reading
    assert keys is not None
    assert agreement(NOTES, keys.notes).f1 >= 0.95


def test_videonotes_on_a_folder_of_synthetic_videos(tmp_path: Path) -> None:
    pytest.importorskip("pretty_midi")
    from tests.synthetic_videos import write_video

    videos, out = tmp_path / "videos", tmp_path / "out"
    videos.mkdir()
    write_video(NOTES, STYLE, videos / "oda.mp4")

    code = main(["videonotes", "run", "--video-dir", str(videos), "--out", str(out), "--models"])

    assert code == 0
    [song] = json.loads((out / "results.json").read_text())["songs"]
    assert song["error"] is None
    assert song["reading"]["preferred"] == "keys"
    truth = next(c for c in song["comparisons"] if c["estimate"] == "video:keys")
    assert truth["reference"] == "verdad"
    assert truth["aligned_50ms"]["f1"] >= 0.95
    assert song["reading_usage"]["peak_mb"] > 0
    [song_dir] = [p for p in out.iterdir() if p.is_dir()]
    assert {p.name for p in song_dir.iterdir()} == {
        "plate.png",
        "frame.png",
        "keyboard.png",
        "roll.png",
        "video.mid",
        "video.wav",
    }
    assert not (out / ".work").exists()
    assert (videos / "oda.mp4").exists()  # the user's own files are never touched
    assert "F1 vs verdad" in (out / "report.md").read_text()
