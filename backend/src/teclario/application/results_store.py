"""JSON persistence of benchmark results, so ``gate`` can run without redoing the work."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from teclario.domain.models import ModelRun, ResourceUsage, SongResult

_SCHEMA_VERSION = 1


def dump_results(songs: list[SongResult], environment: dict[str, str]) -> str:
    payload = {
        "schema": _SCHEMA_VERSION,
        "environment": environment,
        "songs": [_song_to_dict(song) for song in songs],
    }
    return json.dumps(payload, indent=2, ensure_ascii=False)


def load_results(text: str) -> tuple[list[SongResult], dict[str, str]]:
    payload = json.loads(text)
    if payload.get("schema") != _SCHEMA_VERSION:
        raise ValueError(f"unsupported results schema: {payload.get('schema')!r}")
    songs = [_song_from_dict(item) for item in payload["songs"]]
    return songs, dict(payload["environment"])


def _song_to_dict(song: SongResult) -> dict[str, Any]:
    return {
        "index": song.index,
        "label": song.label,
        "fingerprint": song.fingerprint,
        "duration_seconds": song.duration_seconds,
        "download_seconds": song.download_seconds,
        "download_error": song.download_error,
        "runs": [_run_to_dict(run) for run in song.runs],
    }


def _run_to_dict(run: ModelRun) -> dict[str, Any]:
    return {
        "model_name": run.model_name,
        "midi_path": str(run.midi_path) if run.midi_path else None,
        "wav_path": str(run.wav_path) if run.wav_path else None,
        "note_count": run.note_count,
        "inference_seconds": run.inference_seconds,
        "wall_seconds": run.usage.wall_seconds if run.usage else None,
        "peak_rss_mb": run.usage.peak_rss_mb if run.usage else None,
        "error": run.error,
    }


def _song_from_dict(item: dict[str, Any]) -> SongResult:
    return SongResult(
        index=item["index"],
        label=item["label"],
        fingerprint=item["fingerprint"],
        duration_seconds=item["duration_seconds"],
        download_seconds=item["download_seconds"],
        download_error=item["download_error"],
        runs=tuple(_run_from_dict(run) for run in item["runs"]),
    )


def _run_from_dict(item: dict[str, Any]) -> ModelRun:
    usage = (
        ResourceUsage(item["wall_seconds"], item["peak_rss_mb"])
        if item["wall_seconds"] is not None and item["peak_rss_mb"] is not None
        else None
    )
    return ModelRun(
        model_name=item["model_name"],
        midi_path=Path(item["midi_path"]) if item["midi_path"] else None,
        wav_path=Path(item["wav_path"]) if item["wav_path"] else None,
        note_count=item["note_count"],
        inference_seconds=item["inference_seconds"],
        usage=usage,
        error=item["error"],
    )
