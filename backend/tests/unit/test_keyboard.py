from __future__ import annotations

import pytest

from notacaida.domain.keyboard import (
    first_white_pitch,
    letter_offset,
    name_keys,
    white_key_pitches,
)

# Gaps of a white-key run starting at C: C|D, D|E have a black key, E|F not, ...
OCTAVE_FROM_C = [True, True, False, True, True, True, False]


def gaps_from(start: int, whites: int) -> list[bool]:
    return [OCTAVE_FROM_C[(start + i) % 7] for i in range(whites - 1)]


@pytest.mark.parametrize("start", range(7))
def test_letter_offset_finds_the_first_white_key(start: int) -> None:
    assert letter_offset(gaps_from(start, 20)) == (start, 0)


def test_letter_offset_refuses_a_keyboard_too_short_to_name() -> None:
    assert letter_offset([True, True]) is None  # C-D-E or F-G-A or G-A-B
    assert letter_offset([]) is None


def test_letter_offset_tolerates_a_missed_black_key_only_when_allowed() -> None:
    gaps = gaps_from(5, 52)
    gaps[10] = not gaps[10]

    assert letter_offset(gaps) is None
    assert letter_offset(gaps, max_mismatches=1) == (5, 1)


def test_a_full_piano_is_named_a0_to_c8() -> None:
    naming = name_keys(gaps_from(5, 52))

    assert naming is not None
    assert naming.white_pitches[0] == 21
    assert naming.white_pitches[-1] == 108
    blacks = [p for p in naming.black_pitches if p is not None]
    assert len(naming.white_pitches) + len(blacks) == 88
    assert blacks[0] == 22  # A#0
    assert all(p % 12 in (1, 3, 6, 8, 10) for p in blacks)


def test_standard_keyboards_start_where_real_ones_do() -> None:
    assert first_white_pitch(start=0, white_count=36) == 36  # 61 keys: C2
    assert first_white_pitch(start=2, white_count=45) == 28  # 76 keys: E1


def test_other_sizes_are_centred_on_middle_c() -> None:
    first = first_white_pitch(start=0, white_count=15)  # two octaves from a C
    pitches = white_key_pitches(first, 15)

    assert first == 48
    assert pitches[0] <= 60 <= pitches[-1]


def test_white_key_pitches_steps_by_semitone_at_e_f_and_b_c() -> None:
    assert white_key_pitches(64, 4) == (64, 65, 67, 69)
    assert white_key_pitches(71, 2) == (71, 72)
    with pytest.raises(ValueError, match="white key"):
        white_key_pitches(61, 3)
