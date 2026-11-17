"""Use case: turn raw transcribed notes into every playable level and its score."""

from __future__ import annotations

from pianola.application.ports import ScoreBuilder
from pianola.domain.notes import Transcription
from pianola.domain.polyphony import (
    EASY,
    PLAYABLE,
    PlayabilityPolicy,
    ReductionStats,
    max_polyphony,
    reduce_polyphony,
)
from pianola.domain.quantize import quantize
from pianola.domain.result import LevelName, LevelResult, SongResult
from pianola.domain.tempo import estimate_tempo

_REDUCED: tuple[tuple[LevelName, PlayabilityPolicy], ...] = (
    ("playable", PLAYABLE),
    ("easy", EASY),
)


class BuildResult:
    def __init__(self, score_builder: ScoreBuilder) -> None:
        self._score_builder = score_builder

    def execute(self, transcription: Transcription) -> SongResult:
        notes = transcription.notes
        tempo = estimate_tempo(notes)
        peak = max_polyphony(notes)
        untouched = ReductionStats(len(notes), len(notes), peak, peak)
        levels = [LevelResult("original", notes, untouched, None)]
        for name, policy in _REDUCED:
            reduction = reduce_polyphony(notes, policy)
            score = self._score_builder.build(quantize(reduction.notes, tempo))
            levels.append(LevelResult(name, reduction.notes, reduction.stats, score))
        return SongResult(transcription.duration_s, tempo.bpm, tempo.confidence, tuple(levels))
