"""Basic Pitch adapter (Spotify, Apache-2.0), running on the ONNX runtime."""

from __future__ import annotations

import time
from pathlib import Path

from pianola.domain.errors import TranscriptionError
from pianola.domain.models import AudioFile, TranscriptionOutput


class BasicPitchTranscriber:
    """Stateless and picklable: the model is loaded inside ``transcribe``."""

    @property
    def name(self) -> str:
        return "basic-pitch"

    def transcribe(self, audio: AudioFile, midi_path: Path) -> TranscriptionOutput:
        try:
            from basic_pitch import ICASSP_2022_MODEL_PATH
            from basic_pitch.inference import Model, predict

            model = Model(ICASSP_2022_MODEL_PATH)  # load time is excluded from inference time
            started = time.perf_counter()
            _, midi, _ = predict(audio.path, model)
            elapsed = time.perf_counter() - started
            midi.write(str(midi_path))
        except Exception as exc:
            raise TranscriptionError(f"basic-pitch failed: {type(exc).__name__}: {exc}") from exc
        note_count = sum(len(instrument.notes) for instrument in midi.instruments)
        return TranscriptionOutput(note_count=note_count, inference_seconds=elapsed)
