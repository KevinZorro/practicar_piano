"""How well two lists of notes agree: the note-level precision, recall and F1 of MIREX.

A note of the estimate matches a note of the reference when both have the same pitch and
their onsets are within a tolerance (50 ms is the MIREX standard); optionally their offsets
must agree too. Each note matches at most once. Matching runs per pitch over onsets sorted in
time: taking, for each reference note, the earliest compatible estimate is a maximum matching
for onset windows (they are intervals), so no bipartite solver is needed.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from notacaida.domain.notes import NoteEvent


@dataclass(frozen=True, slots=True)
class Criteria:
    onset_tolerance_s: float = 0.05
    #: Also require offsets within max(min_offset_tolerance_s, offset_ratio * duration).
    with_offsets: bool = False
    offset_ratio: float = 0.2
    min_offset_tolerance_s: float = 0.05


ONSET_50MS = Criteria()
ONSET_100MS = Criteria(onset_tolerance_s=0.1)
NOTE_50MS = Criteria(with_offsets=True)
#: Window used to measure a constant delay between two transcriptions of the same song.
_DELAY_WINDOW = Criteria(onset_tolerance_s=0.15)


@dataclass(frozen=True, slots=True)
class Agreement:
    matched: int
    reference_count: int
    estimate_count: int
    #: Median of (estimate onset - reference onset) over the matched notes, in seconds.
    median_onset_error_s: float | None

    @property
    def precision(self) -> float:
        return self.matched / self.estimate_count if self.estimate_count else 0.0

    @property
    def recall(self) -> float:
        return self.matched / self.reference_count if self.reference_count else 0.0

    @property
    def f1(self) -> float:
        total = self.precision + self.recall
        return 2 * self.precision * self.recall / total if total else 0.0


def agreement(
    reference: Sequence[NoteEvent],
    estimate: Sequence[NoteEvent],
    criteria: Criteria = ONSET_50MS,
    *,
    pitch_shift: int = 0,
    time_shift_s: float = 0.0,
) -> Agreement:
    """Compare ``estimate`` (moved by ``pitch_shift`` semitones and ``time_shift_s``) with
    ``reference``."""
    moved = [
        NoteEvent(n.pitch + pitch_shift, n.start_s + time_shift_s, n.end_s + time_shift_s, 0)
        for n in estimate
    ]
    errors = _match(reference, moved, criteria)
    return Agreement(
        matched=len(errors),
        reference_count=len(reference),
        estimate_count=len(estimate),
        median_onset_error_s=statistics.median(errors) if errors else None,
    )


def estimate_delay(
    reference: Sequence[NoteEvent], estimate: Sequence[NoteEvent], *, pitch_shift: int = 0
) -> float | None:
    """Constant delay of ``estimate`` against ``reference`` (median onset difference, seconds).

    Measured over notes paired within 150 ms, wide enough for a video drawn slightly ahead
    of its audio and narrow enough not to pair the neighbouring note of a fast run.
    """
    return agreement(
        reference, estimate, _DELAY_WINDOW, pitch_shift=pitch_shift
    ).median_onset_error_s


def best_pitch_shift(
    reference: Sequence[NoteEvent],
    estimate: Sequence[NoteEvent],
    shifts: Iterable[int],
    criteria: Criteria = ONSET_50MS,
) -> tuple[int, Agreement]:
    """The transposition of ``estimate`` that agrees best with ``reference`` (0 on a tie)."""
    scored = [(agreement(reference, estimate, criteria, pitch_shift=s), s) for s in shifts]
    best, shift = max(scored, key=lambda pair: (pair[0].matched, -abs(pair[1])))
    return shift, best


def _match(
    reference: Sequence[NoteEvent], estimate: Sequence[NoteEvent], criteria: Criteria
) -> list[float]:
    """Onset errors (estimate - reference) of the matched pairs."""
    estimates_by_pitch: dict[int, list[NoteEvent]] = defaultdict(list)
    for note in estimate:
        estimates_by_pitch[note.pitch].append(note)
    references_by_pitch: dict[int, list[NoteEvent]] = defaultdict(list)
    for note in reference:
        references_by_pitch[note.pitch].append(note)

    tolerance = criteria.onset_tolerance_s
    errors: list[float] = []
    for pitch, references in references_by_pitch.items():
        candidates = sorted(estimates_by_pitch.get(pitch, []), key=lambda n: n.start_s)
        used = [False] * len(candidates)
        first = 0  # candidates before it are too early for this and every later reference
        for ref in sorted(references, key=lambda n: n.start_s):
            while first < len(candidates) and candidates[first].start_s < ref.start_s - tolerance:
                first += 1
            index = first
            while index < len(candidates) and candidates[index].start_s <= ref.start_s + tolerance:
                if not used[index] and _offsets_agree(ref, candidates[index], criteria):
                    used[index] = True
                    errors.append(candidates[index].start_s - ref.start_s)
                    break
                index += 1
    return errors


def _offsets_agree(ref: NoteEvent, est: NoteEvent, criteria: Criteria) -> bool:
    if not criteria.with_offsets:
        return True
    tolerance = max(
        criteria.min_offset_tolerance_s, criteria.offset_ratio * (ref.end_s - ref.start_s)
    )
    return abs(est.end_s - ref.end_s) <= tolerance
