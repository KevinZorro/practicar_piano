"""Phase 0 use case: download, transcribe with each model, synthesize, clean up."""

from __future__ import annotations

import logging
import shutil
import time
from collections.abc import Callable, Sequence
from dataclasses import replace
from functools import partial
from pathlib import Path

from notacaida.application.links import SongEntry
from notacaida.application.ports import AudioDownloader, ResourceMeter, Synthesizer, Transcriber
from notacaida.domain.errors import DurationLimitExceededError, NotacaidaError
from notacaida.domain.models import AudioFile, ModelRun, SongResult

logger = logging.getLogger(__name__)


class RunBenchmark:
    def __init__(
        self,
        downloader: AudioDownloader,
        transcribers: Sequence[Transcriber],
        synthesizer: Synthesizer,
        meter: ResourceMeter,
        *,
        max_duration_seconds: float,
        clock: Callable[[], float] = time.perf_counter,
    ) -> None:
        self._downloader = downloader
        self._transcribers = tuple(transcribers)
        self._synthesizer = synthesizer
        self._meter = meter
        self._max_duration_seconds = max_duration_seconds
        self._clock = clock

    def run(self, entries: Sequence[SongEntry], out_dir: Path, work_dir: Path) -> list[SongResult]:
        return [self._run_song(entry, out_dir, work_dir) for entry in entries]

    def _run_song(self, entry: SongEntry, out_dir: Path, work_dir: Path) -> SongResult:
        fingerprint = entry.source.fingerprint
        song_out = out_dir / f"{entry.index:02d}-{fingerprint}"
        song_work = work_dir / f"{entry.index:02d}-{fingerprint}"
        logger.info("[%02d] %s (%s): start", entry.index, entry.label, fingerprint)
        song_out.mkdir(parents=True, exist_ok=True)
        song_work.mkdir(parents=True, exist_ok=True)
        base = SongResult(index=entry.index, label=entry.label, fingerprint=fingerprint)
        try:
            started = self._clock()
            try:
                audio = self._downloader.download(entry.source, song_work)
            except NotacaidaError as exc:
                logger.warning("song %s: download failed: %s", fingerprint, exc)
                return replace(base, download_error=str(exc))
            download_seconds = self._clock() - started
            if audio.duration_seconds > self._max_duration_seconds:
                error = DurationLimitExceededError(
                    f"{audio.duration_seconds:.0f}s exceeds limit of "
                    f"{self._max_duration_seconds:.0f}s"
                )
                return replace(
                    base,
                    duration_seconds=audio.duration_seconds,
                    download_seconds=download_seconds,
                    download_error=str(error),
                )
            runs = tuple(self._run_model(t, audio, song_out) for t in self._transcribers)
            return replace(
                base,
                duration_seconds=audio.duration_seconds,
                download_seconds=download_seconds,
                runs=runs,
            )
        finally:
            # The audio must never outlive the song, even when something fails.
            shutil.rmtree(song_work, ignore_errors=True)

    def _run_model(self, transcriber: Transcriber, audio: AudioFile, song_out: Path) -> ModelRun:
        name = transcriber.name
        midi_path = song_out / f"{name}.mid"
        wav_path = song_out / f"{name}.wav"
        try:
            measured = self._meter.measure(partial(transcriber.transcribe, audio, midi_path))
            self._synthesizer.render(midi_path, wav_path)
        except NotacaidaError as exc:
            logger.warning("model %s failed: %s", name, exc)
            return ModelRun(model_name=name, error=str(exc))
        return ModelRun(
            model_name=name,
            midi_path=midi_path,
            wav_path=wav_path,
            note_count=measured.value.note_count,
            inference_seconds=measured.value.inference_seconds,
            usage=measured.usage,
        )
