"""ByteDance high-resolution piano transcription adapter (Kong et al., 2021).

The package would download its checkpoint with ``wget`` and no integrity check, so this
adapter refuses to start without an explicit, pre-fetched checkpoint file
(``scripts/fetch_bytedance_checkpoint.sh`` downloads and verifies it). See ADR 0013.
"""

from __future__ import annotations

import time
from pathlib import Path

from pianola.domain.errors import TranscriptionError
from pianola.domain.models import AudioFile, TranscriptionOutput

DEFAULT_CHECKPOINT = (
    Path.home() / "piano_transcription_inference_data" / "note_F1=0.9677_pedal_F1=0.9186.pth"
)
_MIN_CHECKPOINT_BYTES = 160_000_000  # the real file is about 165 MB


class ByteDanceTranscriber:
    def __init__(self, checkpoint_path: Path = DEFAULT_CHECKPOINT, device: str = "cpu") -> None:
        self._checkpoint_path = checkpoint_path
        self._device = device

    @property
    def name(self) -> str:
        return "bytedance"

    def transcribe(self, audio: AudioFile, midi_path: Path) -> TranscriptionOutput:
        self._require_checkpoint()
        try:
            from piano_transcription_inference import PianoTranscription, load_audio, sample_rate

            waveform, _ = load_audio(str(audio.path), sr=sample_rate, mono=True)
            transcriptor = PianoTranscription(
                device=self._device, checkpoint_path=str(self._checkpoint_path)
            )
            started = time.perf_counter()
            result = transcriptor.transcribe(waveform, str(midi_path))
            elapsed = time.perf_counter() - started
        except Exception as exc:
            raise TranscriptionError(f"bytedance failed: {type(exc).__name__}: {exc}") from exc
        return TranscriptionOutput(
            note_count=len(result.get("est_note_events", [])), inference_seconds=elapsed
        )

    def _require_checkpoint(self) -> None:
        path = self._checkpoint_path
        if not path.is_file() or path.stat().st_size < _MIN_CHECKPOINT_BYTES:
            raise TranscriptionError(
                f"checkpoint not found or incomplete at {path}; "
                "run backend/scripts/fetch_bytedance_checkpoint.sh"
            )
