"""Gate 1 rule (feasibility study): >= 8 of 10 songs recognizable and < 2 minutes of
processing per 3-minute song.

"Recognizable" is judged by ear, so verdicts come from the user; speed is computed.
Speed is normalized to a real-time factor (processing / song duration), so songs of
any length are compared against the same 120 s per 180 s budget.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import Enum

from teclario.domain.models import ModelRun, SongResult

Verdicts = Mapping[tuple[int, str], bool]


@dataclass(frozen=True, slots=True)
class GateCriteria:
    min_recognizable: int = 8
    total_songs: int = 10
    max_processing_seconds: float = 120.0
    reference_duration_seconds: float = 180.0

    @property
    def max_realtime_factor(self) -> float:
        return self.max_processing_seconds / self.reference_duration_seconds


class GateStatus(Enum):
    PASS = "PASS"  # noqa: S105  one model meets both criteria
    PARTIAL = "PARTIAL"  # enough songs recognizable only by mixing models, or too slow
    FAIL = "FAIL"
    INCOMPLETE = "INCOMPLETE"  # missing songs or missing verdicts


@dataclass(frozen=True, slots=True)
class ModelGate:
    model_name: str
    recognizable: int
    failed_songs: int
    slowest_realtime_factor: float | None
    within_time: bool


@dataclass(frozen=True, slots=True)
class GateResult:
    status: GateStatus
    criteria: GateCriteria
    models: tuple[ModelGate, ...]
    songs_total: int
    downloads_ok: int
    union_recognizable: int
    pending_verdicts: int


def realtime_factor(run: ModelRun, duration_seconds: float | None) -> float | None:
    if run.inference_seconds is None or not duration_seconds:
        return None
    return run.inference_seconds / duration_seconds


def evaluate_gate(
    songs: Sequence[SongResult],
    verdicts: Verdicts,
    criteria: GateCriteria | None = None,
) -> GateResult:
    criteria = criteria or GateCriteria()
    model_names = sorted({run.model_name for song in songs for run in song.runs})
    pending = sum(
        1
        for song in songs
        for run in song.runs
        if run.succeeded and (song.index, run.model_name) not in verdicts
    )
    models = tuple(_evaluate_model(name, songs, verdicts, criteria) for name in model_names)
    union = sum(
        1
        for song in songs
        if any(
            run.succeeded and verdicts.get((song.index, run.model_name), False) for run in song.runs
        )
    )
    downloads_ok = sum(1 for song in songs if song.downloaded)

    if len(songs) < criteria.total_songs or pending > 0:
        status = GateStatus.INCOMPLETE
    elif any(m.recognizable >= criteria.min_recognizable and m.within_time for m in models):
        status = GateStatus.PASS
    elif union >= criteria.min_recognizable:
        status = GateStatus.PARTIAL
    else:
        status = GateStatus.FAIL
    return GateResult(
        status=status,
        criteria=criteria,
        models=models,
        songs_total=len(songs),
        downloads_ok=downloads_ok,
        union_recognizable=union,
        pending_verdicts=pending,
    )


def _evaluate_model(
    name: str, songs: Sequence[SongResult], verdicts: Verdicts, criteria: GateCriteria
) -> ModelGate:
    recognizable = 0
    failed = 0
    factors: list[float] = []
    for song in songs:
        run = song.run_for(name)
        if run is None or not run.succeeded:
            failed += 1
            continue
        if verdicts.get((song.index, name), False):
            recognizable += 1
        factor = realtime_factor(run, song.duration_seconds)
        if factor is None:
            failed += 1
        else:
            factors.append(factor)
    slowest = max(factors) if factors else None
    # Songs that never produced a run (failed download) do not count against speed.
    within_time = (
        bool(factors)
        and failed == _undownloaded(songs)
        and all(f < criteria.max_realtime_factor for f in factors)
    )
    return ModelGate(name, recognizable, failed, slowest, within_time)


def _undownloaded(songs: Sequence[SongResult]) -> int:
    return sum(1 for song in songs if not song.downloaded)
