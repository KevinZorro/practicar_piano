"""Server for the browser end-to-end test: the real pipeline, offline.

Run from ``backend/`` with ``uvicorn tests.e2e_server:create_app --factory``. Instead of YouTube
it serves a public-domain melody (Beethoven, "Ode to Joy", 1824) rendered at start-up from notes
written in code, and it transcribes it with Basic Pitch (ONNX). Needs the ``synth``,
``basic-pitch`` and ``score`` extras. Never used in production.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI

from teclario.api.app import create_app as create_service_app
from teclario.api.settings import Settings
from teclario.api.wiring import build_container
from teclario.domain.models import AudioFile, SongSource
from teclario.domain.video_url import VideoUrl
from teclario.infrastructure.basic_pitch_transcriber import BasicPitchTranscriber
from teclario.infrastructure.synthesizer import AdditiveSynthesizer

ODE_TO_JOY = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62]
NOTE_SECONDS = 0.5
DURATION_SECONDS = len(ODE_TO_JOY) * NOTE_SECONDS


def render_melody(wav_path: Path) -> None:
    import pretty_midi

    midi = pretty_midi.PrettyMIDI()
    piano = pretty_midi.Instrument(program=0)
    for index, pitch in enumerate(ODE_TO_JOY):
        start = index * NOTE_SECONDS
        piano.notes.append(
            pretty_midi.Note(velocity=95, pitch=pitch, start=start, end=start + NOTE_SECONDS * 0.9)
        )
    midi.instruments.append(piano)
    midi_path = wav_path.with_suffix(".mid")
    midi.write(str(midi_path))
    AdditiveSynthesizer().render(midi_path, wav_path)


class SyntheticSource:
    """Stands in for YouTube: every link yields the same melody."""

    def __init__(self, wav_path: Path) -> None:
        self._wav_path = wav_path

    def probe(self, video: VideoUrl) -> float:
        return DURATION_SECONDS

    def download(self, source: SongSource, dest_dir: Path) -> AudioFile:
        dest_dir.mkdir(parents=True, exist_ok=True)
        target = dest_dir / "audio.wav"
        shutil.copyfile(self._wav_path, target)
        return AudioFile(path=target, duration_seconds=DURATION_SECONDS)


def create_app() -> FastAPI:
    work = Path(tempfile.mkdtemp(prefix="teclario-e2e-"))
    wav = work / "ode.wav"
    render_melody(wav)
    settings = Settings.from_env({"TECLARIO_WORK_DIR": str(work / "jobs")})
    (work / "jobs").mkdir()
    container = build_container(
        settings, source=SyntheticSource(wav), transcriber=BasicPitchTranscriber()
    )
    return create_service_app(container)
