from __future__ import annotations

import numpy as np
import pytest

from notacaida.infrastructure.keyboard_detector import detect_keyboard, note_name
from tests.support.falling_video import Style, key_span, keyboard_rows, plate

FULL = Style("full")


@pytest.mark.parametrize(
    ("low", "high", "described"),
    [
        (21, 108, "88 teclas, A0-C8"),
        (28, 103, "76 teclas, E1-G7"),
        (36, 96, "61 teclas, C2-C7"),
        (36, 84, "49 teclas, C2-C6"),
        (48, 84, "37 teclas, C3-C6"),
    ],
)
def test_standard_keyboards_are_found_and_named(low: int, high: int, described: str) -> None:
    keyboard = detect_keyboard(plate(Style("s", low=low, high=high)))

    assert keyboard is not None
    assert keyboard.describe() == described
    assert [k.pitch for k in keyboard.keys] == list(range(low, high + 1))
    assert keyboard.mismatches == 0


def test_another_size_is_centred_on_middle_c() -> None:
    keyboard = detect_keyboard(plate(Style("s", low=41, high=79)))  # F2-G5

    assert keyboard is not None
    assert (keyboard.keys[0].pitch, keyboard.keys[-1].pitch) == (41, 79)


def test_every_key_is_where_it_is_drawn() -> None:
    keyboard = detect_keyboard(plate(FULL))

    assert keyboard is not None
    for key in keyboard.keys:
        left, right = key_span(FULL, key.pitch)
        assert key.is_black == (key.pitch % 12 in (1, 3, 6, 8, 10))
        assert abs(key.left - left) <= 1.5, note_name(key.pitch)
        assert abs(key.right - right) <= 1.5, note_name(key.pitch)


def test_the_rows_of_the_keys_are_found() -> None:
    keyboard = detect_keyboard(plate(FULL))
    top, black_bottom = keyboard_rows(FULL)

    assert keyboard is not None
    assert abs(keyboard.top - top) <= 2
    assert abs(keyboard.black_bottom - black_bottom) <= 2
    assert keyboard.bottom >= FULL.height - 4


@pytest.mark.parametrize(
    "style",
    [
        Style("small", width=640, height=360),
        Style("centred-black-keys", offset_black_keys=False),
        Style("no-felt-lanes", felt_px=0, lanes=True),
        Style("tall-keys", keyboard_height=0.3),
    ],
    ids=lambda s: s.name,
)
def test_drawing_variations_still_give_88_keys(style: Style) -> None:
    keyboard = detect_keyboard(plate(style))

    assert keyboard is not None
    assert keyboard.describe() == "88 teclas, A0-C8"


def test_no_keyboard_in_a_plain_or_noisy_picture() -> None:
    rng = np.random.default_rng(3)
    blank = np.full((480, 854, 3), 20, np.uint8)
    noise = rng.integers(0, 256, (480, 854, 3), dtype=np.uint8)

    assert detect_keyboard(blank) is None
    assert detect_keyboard(noise) is None


def test_white_keys_without_black_keys_are_not_a_keyboard() -> None:
    picture = plate(FULL)
    top, black_bottom = keyboard_rows(FULL)
    picture[top:black_bottom] = picture[black_bottom + 4]  # paint the black keys over

    assert detect_keyboard(picture) is None


def test_note_names_follow_scientific_pitch_notation() -> None:
    assert [note_name(p) for p in (21, 60, 61, 108)] == ["A0", "C4", "C#4", "C8"]
