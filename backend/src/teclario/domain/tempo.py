"""Tempo and beat-phase estimation from note onsets (ADR 0009, ADR 0018).

Pure Python. The method is the circular mean of onset times folded at a candidate beat
period: when most onsets sit on one grid the resultants point the same way (length near 1).
It handles syncopation and missing beats better than counting inter-onset intervals, and it
needs no audio. Rubato and tempo changes lower the score, which is reported as confidence.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass
from typing import Literal

from teclario.domain.notes import NoteEvent

MIN_BPM = 50.0
MAX_BPM = 200.0
DEFAULT_BPM = 100.0
#: Onsets closer than this are one strike (a chord).
ONSET_MERGE_S = 0.03
#: Mean-resultant length from which the grid is trusted.
HIGH_CONFIDENCE_SCORE = 0.6
_MIN_ONSETS = 6
_MAX_ONSETS = 4000
# Octave errors (half or double tempo) are common and harmless for notation, so among
# near-equal candidates the one closest to a typical tempo wins.
_PRIOR_SIGMA_OCTAVES = 0.5
_NEAR_BEST = 0.9


@dataclass(frozen=True, slots=True)
class TempoEstimate:
    bpm: float
    #: Time in seconds of a sixteenth-note grid line, in [0, one sixteenth).
    grid_offset_s: float
    #: Onset alignment on the best of the beat, half-beat and quarter-beat grids, 0 to 1.
    score: float
    confidence: Literal["high", "low"]

    @property
    def beat_s(self) -> float:
        return 60.0 / self.bpm

    @property
    def grid_s(self) -> float:
        """Length of the sixteenth-note grid cell."""
        return self.beat_s / 4


def _onsets(notes: tuple[NoteEvent, ...] | list[NoteEvent]) -> list[tuple[float, float]]:
    """(time, weight) per strike: simultaneous notes merge, louder strikes weigh more."""
    ordered = sorted(notes, key=lambda n: n.start_s)
    strikes: list[tuple[float, float]] = []
    for note in ordered:
        if strikes and note.start_s - strikes[-1][0] <= ONSET_MERGE_S:
            time, weight = strikes[-1]
            strikes[-1] = (time, max(weight, note.velocity / 127))
        else:
            strikes.append((note.start_s, note.velocity / 127))
    if len(strikes) > _MAX_ONSETS:
        step = len(strikes) / _MAX_ONSETS
        strikes = [strikes[int(i * step)] for i in range(_MAX_ONSETS)]
    return strikes


def _resultant(strikes: list[tuple[float, float]], period: float) -> complex:
    total = sum(w for _, w in strikes)
    return sum(w * cmath.exp(2j * math.pi * t / period) for t, w in strikes) / total


def _fold(strikes: list[tuple[float, float]], bpm: float) -> tuple[float, float, float]:
    """(selection score, alignment, sixteenth-grid phase in [0, 1)) for a candidate tempo.

    Folding at the beat alone cancels out for an eighth-note melody (half the onsets sit on
    the off-beat), so the beat is judged by how well onsets align at the beat, the half beat
    and the quarter beat together.
    """
    beat = 60.0 / bpm
    beat_level = abs(_resultant(strikes, beat))
    half_level = abs(_resultant(strikes, beat / 2))
    quarter = _resultant(strikes, beat / 4)
    score = (beat_level + half_level + abs(quarter)) / 3
    # Alignment on the best of the three grids does not depend on which octave of the tempo
    # was picked, so it is what confidence is based on.
    alignment = max(beat_level, half_level, abs(quarter))
    return score, alignment, (cmath.phase(quarter) / (2 * math.pi)) % 1.0


def estimate_tempo(notes: tuple[NoteEvent, ...] | list[NoteEvent]) -> TempoEstimate:
    strikes = _onsets(notes)
    if len(strikes) < _MIN_ONSETS:
        first = strikes[0][0] if strikes else 0.0
        return TempoEstimate(DEFAULT_BPM, first % (60 / DEFAULT_BPM / 4), 0.0, "low")

    def preference(bpm: float, score: float) -> float:
        octaves = math.log2(bpm / DEFAULT_BPM)
        return score * math.exp(-(octaves**2) / (2 * _PRIOR_SIGMA_OCTAVES**2))

    # Coarse search every 1 bpm, then refine around the best few (by score weighed with the
    # prior, so a melody in eighths is not read at double tempo just because it aligns better).
    coarse = [(bpm, _fold(strikes, float(bpm))[0]) for bpm in range(int(MIN_BPM), int(MAX_BPM) + 1)]
    best_pref = max(preference(bpm, score) for bpm, score in coarse)
    shortlist = [bpm for bpm, score in coarse if preference(bpm, score) >= _NEAR_BEST * best_pref]
    refined: list[tuple[float, float, float, float]] = []  # (bpm, score, alignment, phase)
    for centre in shortlist:
        for step in range(-10, 11):
            bpm = centre + step / 10
            if MIN_BPM <= bpm <= MAX_BPM:
                score, alignment, phase = _fold(strikes, bpm)
                refined.append((bpm, score, alignment, phase))
    bpm, _, alignment, phase = max(refined, key=lambda r: preference(r[0], r[1]))
    return TempoEstimate(
        bpm=round(bpm, 1),
        grid_offset_s=phase * 60.0 / bpm / 4,
        score=alignment,
        confidence="high" if alignment >= HIGH_CONFIDENCE_SCORE else "low",
    )
