"""Which MIDI pitch each key of a drawn piano keyboard plays (ADR 0023).

A video shows the keys, not their names. The names come from the black keys: inside an
octave the gaps between white keys carry a black key in the pattern C|D, D|E, -, F|G, G|A,
A|B, - , so the gaps that do (or do not) carry one tell which white key is a C. The octave
comes from the size of the keyboard when it is a standard one, otherwise from centring it on
middle C (a reader can still correct it later against an audio transcription).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from itertools import pairwise

#: Pitch class of the white keys of an octave, starting at C.
WHITE_PITCH_CLASSES = (0, 2, 4, 5, 7, 9, 11)
#: Whether a black key sits between white key i of the octave (from C) and the next one.
_BLACK_AFTER = (True, True, False, True, True, True, False)
LOWEST_PIANO_PITCH = 21  # A0
HIGHEST_PIANO_PITCH = 108  # C8
MIDDLE_C = 60

#: (white keys, index of the first white key from C) -> pitch of that first key.
_STANDARD_KEYBOARDS = {
    (52, 5): 21,  # 88 keys, A0-C8
    (45, 2): 28,  # 76 keys, E1-G7
    (36, 0): 36,  # 61 keys, C2-C7
    (29, 0): 36,  # 49 keys, C2-C6
    (22, 0): 48,  # 37 keys, C3-C6
}


@dataclass(frozen=True, slots=True)
class KeyNaming:
    """Pitches of the white keys, left to right, and of the black keys between them."""

    white_pitches: tuple[int, ...]
    #: Pitch of the black key between white keys i and i+1, or None where there is none.
    black_pitches: tuple[int | None, ...]
    #: Gaps where the drawing disagreed with the octave pattern (0 for a clean detection).
    mismatches: int
    #: False when the keyboard is not a standard size and its octave is only a guess
    #: (centred on middle C).
    octave_known: bool = True


def letter_offset(black_between: Sequence[bool], max_mismatches: int = 0) -> tuple[int, int] | None:
    """Index (0 = C ... 6 = B) of the leftmost white key, and how many gaps disagree.

    ``black_between[i]`` tells whether a black key was seen between white keys i and i+1.
    Returns None when no rotation of the octave pattern fits within ``max_mismatches``, or
    when two rotations fit equally well (a keyboard too short to name).
    """
    if not black_between:
        return None
    scores = sorted(
        (sum(_BLACK_AFTER[(start + i) % 7] != seen for i, seen in enumerate(black_between)), start)
        for start in range(7)
    )
    (best, start), (runner_up, _) = scores[0], scores[1]
    if best > max_mismatches or runner_up == best:
        return None
    return start, best


def first_white_pitch(start: int, white_count: int) -> int:
    """Pitch of the leftmost white key, given its index from C and the number of white keys.

    Standard keyboards start where real ones do; any other size is centred on middle C, and
    the result always stays inside the 88 keys of a piano when it fits.
    """
    standard = _STANDARD_KEYBOARDS.get((white_count, start))
    if standard is not None:
        return standard
    candidates = [12 * octave + WHITE_PITCH_CLASSES[start] for octave in range(10)]

    def fit(first: int) -> tuple[bool, float, int]:
        pitches = white_key_pitches(first, white_count)
        outside = pitches[0] < LOWEST_PIANO_PITCH or pitches[-1] > HIGHEST_PIANO_PITCH
        centre = (pitches[0] + pitches[-1]) / 2
        return outside, abs(centre - MIDDLE_C), -first  # on a tie, the higher keyboard

    return min(candidates, key=fit)


def white_key_pitches(first: int, count: int) -> tuple[int, ...]:
    """MIDI pitches of ``count`` consecutive white keys starting at the white key ``first``."""
    if first % 12 not in WHITE_PITCH_CLASSES:
        raise ValueError(f"pitch {first} is not a white key")
    pitches = [first]
    while len(pitches) < count:
        last = pitches[-1]
        pitches.append(last + (1 if last % 12 in (4, 11) else 2))  # E-F and B-C are semitones
    return tuple(pitches)


def name_keys(black_between: Sequence[bool], max_mismatches: int = 0) -> KeyNaming | None:
    """Name every key of a drawn keyboard from where its black keys are.

    Returns None when the pattern cannot be named (see ``letter_offset``) or the result would
    leave the MIDI range. Black keys follow the octave pattern, so a black key the drawing
    missed is still named and a stray one is dropped.
    """
    found = letter_offset(black_between, max_mismatches)
    if found is None:
        return None
    start, mismatches = found
    whites = white_key_pitches(
        first_white_pitch(start, len(black_between) + 1), len(black_between) + 1
    )
    if whites[0] < 0 or whites[-1] > 127:
        return None
    blacks = tuple(low + 1 if high - low == 2 else None for low, high in pairwise(whites))
    return KeyNaming(
        white_pitches=whites,
        black_pitches=blacks,
        mismatches=mismatches,
        octave_known=(len(whites), start) in _STANDARD_KEYBOARDS,
    )
