"""Polyphony reduction: make a transcription playable with two hands (ADR 0017).

Pure functions over ``NoteEvent``. The idea is musical, not statistical: keep what defines
the piece (melody on top, bass at the bottom) and the harmony (root, third, seventh), and
drop what the ear fills in by itself (fifths, octave doublings).
"""

from __future__ import annotations

from dataclasses import dataclass

from teclario.domain.notes import NoteEvent

# Harmonic weight of a pitch class by its interval above the estimated chord root.
_ROOT, _THIRD, _SEVENTH, _EXTENSION, _FIFTH, _COLOUR = 3.0, 2.5, 2.5, 1.5, 1.0, 0.5
_INTERVAL_WEIGHT: dict[int, float] = {
    0: _ROOT,
    3: _THIRD,
    4: _THIRD,
    10: _SEVENTH,
    11: _SEVENTH,
    2: _EXTENSION,
    5: _EXTENSION,
    9: _EXTENSION,
    7: _FIFTH,
    1: _COLOUR,
    6: _COLOUR,
    8: _COLOUR,
}
_DUPLICATE_WEIGHT = 0.2
_BASS_ROOT_BONUS = 0.5


@dataclass(frozen=True, slots=True)
class PlayabilityPolicy:
    max_total: int
    max_per_hand: int
    #: Widest stretch of one hand, in semitones (a tenth is 16).
    max_span: int
    #: Onsets within this many seconds of the first one form a single chord.
    chord_window_s: float = 0.05
    #: Notes shorter than this and not louder than ``ghost_max_velocity`` are model artefacts.
    ghost_min_duration_s: float = 0.06
    ghost_max_velocity: int = 20


PLAYABLE = PlayabilityPolicy(max_total=10, max_per_hand=5, max_span=16)
EASY = PlayabilityPolicy(max_total=8, max_per_hand=4, max_span=12)


@dataclass(frozen=True, slots=True)
class ReductionStats:
    notes_before: int
    notes_after: int
    max_polyphony_before: int
    max_polyphony_after: int

    @property
    def notes_dropped_ratio(self) -> float:
        if self.notes_before == 0:
            return 0.0
        return (self.notes_before - self.notes_after) / self.notes_before


@dataclass(frozen=True, slots=True)
class Reduction:
    notes: tuple[NoteEvent, ...]
    stats: ReductionStats


def max_polyphony(notes: tuple[NoteEvent, ...] | list[NoteEvent]) -> int:
    """Largest number of notes sounding at the same instant."""
    events = sorted(
        [(n.start_s, 1) for n in notes] + [(n.end_s, -1) for n in notes],
        key=lambda e: (e[0], e[1]),  # ends before starts at the same time
    )
    current = peak = 0
    for _, delta in events:
        current += delta
        peak = max(peak, current)
    return peak


def reduce_polyphony(
    notes: tuple[NoteEvent, ...] | list[NoteEvent], policy: PlayabilityPolicy = PLAYABLE
) -> Reduction:
    """Remove ghost notes, then limit simultaneous notes to what two hands can play."""
    cleaned = remove_ghosts(notes, policy)
    limited = limit_polyphony(cleaned, policy)
    stats = ReductionStats(
        notes_before=len(notes),
        notes_after=len(limited),
        max_polyphony_before=max_polyphony(notes),
        max_polyphony_after=max_polyphony(limited),
    )
    return Reduction(notes=tuple(limited), stats=stats)


def remove_ghosts(
    notes: tuple[NoteEvent, ...] | list[NoteEvent], policy: PlayabilityPolicy
) -> list[NoteEvent]:
    return [
        n
        for n in notes
        if not (
            n.end_s - n.start_s < policy.ghost_min_duration_s
            and n.velocity <= policy.ghost_max_velocity
        )
    ]


def limit_polyphony(
    notes: tuple[NoteEvent, ...] | list[NoteEvent], policy: PlayabilityPolicy
) -> list[NoteEvent]:
    """Drop or shorten notes until every moment is playable. Idempotent.

    At each onset ``t`` the notes to satisfy are those sounding at ``t`` plus those that start
    within ``chord_window_s`` after it (a chord struck slightly spread out). Removing notes
    only ever makes a set easier to play, so a second pass finds nothing left to do.
    """
    ends = [n.end_s for n in notes]
    alive = [True] * len(notes)
    _resolve_repeated_keys(notes, ends, alive, policy.chord_window_s)
    order = sorted(
        (i for i in range(len(notes)) if alive[i]), key=lambda i: (notes[i].start_s, notes[i].pitch)
    )
    sounding: list[int] = []
    taken = 0  # order[:taken] have started by the current onset
    for index in order:
        if not alive[index]:
            continue
        onset = notes[index].start_s
        while taken < len(order) and notes[order[taken]].start_s <= onset:
            if alive[order[taken]]:
                sounding.append(order[taken])
            taken += 1
        sounding = [i for i in sounding if alive[i] and ends[i] > onset]
        arriving = []
        j = taken
        while j < len(order) and notes[order[j]].start_s <= onset + policy.chord_window_s:
            if alive[order[j]]:
                arriving.append(order[j])
            j += 1

        # A key that is about to be struck again counts once, as the new strike.
        restruck = {notes[i].pitch for i in arriving}
        shadowed = {notes[i].pitch: i for i in sounding if notes[i].pitch in restruck}
        candidates = [i for i in sounding if notes[i].pitch not in restruck] + arriving
        while not _is_playable([notes[i].pitch for i in candidates], policy):
            victim = _weakest(notes, candidates, ends, policy)
            candidates.remove(victim)
            if notes[victim].start_s < onset:
                ends[victim] = onset  # shorten the held note instead of erasing its attack
                sounding.remove(victim)
            else:
                alive[victim] = False
                if victim in sounding:
                    sounding.remove(victim)
                held = shadowed.pop(notes[victim].pitch, None)
                if held is not None:  # the strike is gone, the held note counts again
                    candidates.append(held)

    result = [
        NoteEvent(n.pitch, n.start_s, ends[i], n.velocity)
        for i, n in enumerate(notes)
        if alive[i] and ends[i] > n.start_s
    ]
    return sorted(result, key=lambda n: (n.start_s, n.pitch))


def _resolve_repeated_keys(
    notes: tuple[NoteEvent, ...] | list[NoteEvent],
    ends: list[float],
    alive: list[bool],
    window: float,
) -> None:
    """One key cannot sound twice: near-simultaneous copies merge, later strikes cut the earlier."""
    by_pitch: dict[int, list[int]] = {}
    for i, n in enumerate(notes):
        by_pitch.setdefault(n.pitch, []).append(i)
    for indices in by_pitch.values():
        indices.sort(key=lambda i: notes[i].start_s)
        current = indices[0]
        for nxt in indices[1:]:
            if notes[nxt].start_s - notes[current].start_s <= window:
                loser = nxt if notes[nxt].velocity <= notes[current].velocity else current
                alive[loser] = False
                current = current if loser == nxt else nxt
            else:
                ends[current] = min(ends[current], notes[nxt].start_s)
                current = nxt


def _span(pitches: list[int]) -> int:
    return pitches[-1] - pitches[0] if pitches else 0


def _is_playable(pitches: list[int], policy: PlayabilityPolicy) -> bool:
    """Can some split into a left and a right hand play all of these at once?"""
    ordered = sorted(pitches)
    if len(ordered) > policy.max_total:
        return False
    for split in range(len(ordered) + 1):
        left, right = ordered[:split], ordered[split:]
        if (
            len(left) <= policy.max_per_hand
            and len(right) <= policy.max_per_hand
            and _span(left) <= policy.max_span
            and _span(right) <= policy.max_span
        ):
            return True
    return False


def _violation(pitches: list[int], policy: PlayabilityPolicy) -> float:
    """How far from playable (0 when playable): excess notes plus excess stretch in octaves."""
    ordered = sorted(pitches)
    best = min(
        max(0, split - policy.max_per_hand)
        + max(0, len(ordered) - split - policy.max_per_hand)
        + (
            max(0, _span(ordered[:split]) - policy.max_span)
            + max(0, _span(ordered[split:]) - policy.max_span)
        )
        / 12
        for split in range(len(ordered) + 1)
    )
    return best + max(0, len(ordered) - policy.max_total)


def _estimate_root(notes: tuple[NoteEvent, ...] | list[NoteEvent], candidates: list[int]) -> int:
    """Pitch class that best explains the sounding notes as stacked thirds over a root."""
    pitch_classes = {notes[i].pitch % 12 for i in candidates}
    bass_pc = min(notes[i].pitch for i in candidates) % 12

    def fit(root: int) -> float:
        total = sum(_INTERVAL_WEIGHT[(notes[i].pitch - root) % 12] for i in candidates)
        return total + (_BASS_ROOT_BONUS if root == bass_pc else 0.0)

    return max(sorted(pitch_classes), key=fit)


def _weakest(
    notes: tuple[NoteEvent, ...] | list[NoteEvent],
    candidates: list[int],
    ends: list[float],
    policy: PlayabilityPolicy,
) -> int:
    """The note whose loss changes the harmony the least. Highest and lowest are protected.

    Only notes whose removal brings the chord closer to playable are considered, so a cheap
    note on the wrong side of the keyboard is not sacrificed in vain.
    """
    top = max(candidates, key=lambda i: (notes[i].pitch, notes[i].velocity))
    bottom = min(candidates, key=lambda i: (notes[i].pitch, -notes[i].velocity))
    root = _estimate_root(notes, candidates)

    # Within a pitch class only the strongest note counts; its octave copies are expendable.
    keeper: dict[int, int] = {}
    for i in candidates:
        pc = notes[i].pitch % 12
        rank = (i in (top, bottom), notes[i].velocity)
        if pc not in keeper or rank > (
            keeper[pc] in (top, bottom),
            notes[keeper[pc]].velocity,
        ):
            keeper[pc] = i

    def score(i: int) -> tuple[float, int]:
        note = notes[i]
        if keeper[note.pitch % 12] != i:
            harmonic = _DUPLICATE_WEIGHT
        else:
            harmonic = _INTERVAL_WEIGHT[(note.pitch - root) % 12]
        duration = min(ends[i] - note.start_s, 2.0)
        # Quieter and shorter notes go first; pitch breaks the remaining ties.
        return (harmonic + note.velocity / 127 * 0.3 + duration / 2 * 0.2, note.pitch)

    removable = [i for i in candidates if i not in (top, bottom)]
    pitches = [notes[i].pitch for i in candidates]
    base = _violation(pitches, policy)
    helpful = [
        i
        for i in removable
        if _violation([p for p in pitches if p != notes[i].pitch], policy) < base
    ]
    return min(helpful or removable, key=score)
