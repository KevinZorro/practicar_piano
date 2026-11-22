"""The reader on frames drawn in memory: exact pictures, no ffmpeg, known notes."""

from __future__ import annotations

import pickle
import statistics
from collections.abc import Iterator, Sequence
from pathlib import Path

import numpy as np
import pytest

from notacaida.domain.agreement import agreement
from notacaida.domain.models import VideoFile
from notacaida.domain.notes import NoteEvent
from notacaida.domain.quantize import assign_hand
from notacaida.domain.video_reading import ReadingMethod, VideoReading
from notacaida.infrastructure.falling_notes_reader import NO_KEYBOARD, FallingNotesReader
from notacaida.infrastructure.ffmpeg_video import Crop, Frames, VideoInfo
from notacaida.infrastructure.keyboard_detector import NO_WHITE_KEYS
from tests.support.falling_video import MemoryFrames, Style
from tests.support.pieces import ode_to_joy, stress

LIT = Style("lit", width=640, height=360, fall_px_s=180.0)
BARS_ONLY = Style(
    "bars-only", width=640, height=360, fall_px_s=180.0, light_keys=False, lanes=True, felt_px=0
)
SMALL_61 = Style("61", width=480, height=270, low=36, high=96, fall_px_s=150.0)
VIDEO = VideoFile(Path("drawn.mp4"), 10.0)


def drawn(piece: Sequence[NoteEvent], style: Style, until_s: float = 9.0) -> tuple[NoteEvent, ...]:
    return tuple(n for n in piece if style.low <= n.pitch <= style.high and n.end_s < until_s)


def read(notes: Sequence[NoteEvent], style: Style, debug_dir: Path | None = None) -> VideoReading:
    duration = max((n.end_s for n in notes), default=8.0) + 1.0
    return FallingNotesReader(MemoryFrames(notes, style, duration)).read(VIDEO, debug_dir)


def onset_errors(truth: Sequence[NoteEvent], estimate: Sequence[NoteEvent]) -> list[float]:
    by_pitch: dict[int, list[float]] = {}
    for note in estimate:
        by_pitch.setdefault(note.pitch, []).append(note.start_s)
    return [
        min(abs(start - note.start_s) for start in by_pitch[note.pitch])
        for note in truth
        if note.pitch in by_pitch
    ]


def test_lit_keys_and_bars_both_read_the_notes() -> None:
    notes = drawn(ode_to_joy(), LIT)

    reading = read(notes, LIT)

    assert reading.readable
    assert reading.keyboard == "88 teclas, A0-C8"
    assert reading.lit_keys
    assert reading.preferred is ReadingMethod.KEYS
    assert reading.fall_speed_px_s == pytest.approx(180.0, rel=0.02)
    assert reading.frames == reading.frames_with_keyboard
    assert reading.bar_key_agreement == pytest.approx(1.0)
    assert reading.bar_delay_s is not None
    assert abs(reading.bar_delay_s) <= 1.0 / LIT.fps
    for method in ReadingMethod:
        found = reading.reading(method)
        assert found is not None
        assert agreement(notes, found.notes).f1 >= 0.98, method
    keys = reading.preferred_reading
    assert keys is not None
    # a key lights on the first frame after its note starts: half a frame early on average
    assert abs(statistics.median(onset_errors(notes, keys.notes))) <= 0.5 / LIT.fps + 0.001


def test_without_lit_keys_only_the_bars_are_read() -> None:
    notes = drawn(ode_to_joy(), BARS_ONLY)

    reading = read(notes, BARS_ONLY)

    assert not reading.lit_keys
    assert [r.method for r in reading.readings] == [ReadingMethod.BARS]
    assert reading.preferred is ReadingMethod.BARS
    assert reading.bar_key_agreement is None
    bars = reading.preferred_reading
    assert bars is not None
    assert agreement(notes, bars.notes).f1 >= 0.98


def test_fast_repetitions_trills_and_chords_on_a_61_key_keyboard() -> None:
    notes = drawn(stress(), SMALL_61, until_s=30.0)

    reading = read(notes, SMALL_61)

    assert reading.keyboard == "61 teclas, C2-C7"
    keys = reading.preferred_reading
    assert keys is not None
    assert keys.method is ReadingMethod.KEYS
    # a repetition whose gap falls between two frames stays lit: one note instead of two
    assert agreement(notes, keys.notes).f1 >= 0.98


def test_lit_keys_count_even_when_the_bars_are_misread() -> None:
    style = Style("misdrawn-bars", width=640, height=360, fall_px_s=180.0, bar_shift=1.0)
    notes = drawn(ode_to_joy(), style)

    reading = read(notes, style)

    assert reading.lit_keys
    assert reading.bar_key_agreement is not None
    assert reading.bar_key_agreement < 0.3  # the bars land on the next key
    assert reading.preferred is ReadingMethod.KEYS
    keys = reading.preferred_reading
    assert keys is not None
    assert agreement(notes, keys.notes).f1 >= 0.98


def test_a_logo_over_a_video_without_lit_keys_is_not_read_as_keys() -> None:
    style = Style(
        "logo",
        width=640,
        height=360,
        fall_px_s=180.0,
        light_keys=False,
        logo_s=((2.0, 2.5), (7.0, 7.5), (12.0, 12.5), (17.0, 17.5)),  # 20 "lit" runs
    )
    notes = drawn(ode_to_joy(), style, until_s=30.0)  # 62 notes in 20 s

    reading = read(notes, style)

    assert not reading.lit_keys
    assert reading.preferred is ReadingMethod.BARS
    bars = reading.preferred_reading
    assert bars is not None
    assert agreement(notes, bars.notes).f1 >= 0.95


def test_keys_with_printed_letters_are_still_read() -> None:
    style = Style("labels", width=640, height=360, fall_px_s=180.0, key_labels=True)
    notes = drawn(ode_to_joy(), style)

    reading = read(notes, style)

    assert reading.keyboard == "88 teclas, A0-C8"
    assert reading.preferred is ReadingMethod.KEYS
    keys = reading.preferred_reading
    assert keys is not None
    assert agreement(notes, keys.notes).f1 >= 0.98


def test_two_bar_colours_give_the_hands() -> None:
    notes = drawn(ode_to_joy(), LIT)

    reading = read(notes, LIT)

    for method in ReadingMethod:  # the lit notes take the hand of the bar landing on them
        found = reading.reading(method)
        assert found is not None
        assert len(found.hands) == len(found.notes)
        same = sum(
            hand is assign_hand(n.pitch) for n, hand in zip(found.notes, found.hands, strict=True)
        )
        assert same / len(found.notes) >= 0.95, method  # the drawing colours hands that way


def test_one_bar_colour_gives_no_hands() -> None:
    style = Style("one-colour", width=640, height=360, fall_px_s=180.0, left_colour=(90, 200, 110))
    notes = drawn(ode_to_joy(), style)

    reading = read(notes, style)

    assert all(r.hands == () for r in reading.readings)


def test_the_check_images_are_written(tmp_path: Path) -> None:
    read(drawn(ode_to_joy(), LIT), LIT, tmp_path)

    for name in ("plate.png", "frame.png", "keyboard.png"):
        assert (tmp_path / name).read_bytes()[:8] == b"\x89PNG\r\n\x1a\n", name


def test_a_keyboard_without_falling_bars_is_reported_not_raised() -> None:
    reading = read((), LIT)

    assert not reading.readable
    assert reading.failure == "no se vieron barras cayendo a velocidad constante"
    assert reading.keyboard == "88 teclas, A0-C8"


class BlankFrames:
    """A video with no keyboard at all (a filmed piano, a talking head...)."""

    def probe(self, path: Path) -> VideoInfo:
        return VideoInfo(320, 180, 30.0, 5.0)

    def key_frames(self, path: Path, info: VideoInfo, limit: int) -> Frames:
        return np.full((limit, info.height, info.width, 3), 30, np.uint8)

    def stream(
        self,
        path: Path,
        info: VideoInfo,
        *,
        crop: Crop | None = None,
        start_s: float = 0.0,
        duration_s: float | None = None,
        batch: int = 32,
    ) -> Iterator[Frames]:
        raise AssertionError("nothing to stream without a keyboard")


def test_a_video_without_a_drawn_keyboard_is_reported_not_raised(tmp_path: Path) -> None:
    reading = FallingNotesReader(BlankFrames()).read(VIDEO, tmp_path)

    assert reading.failure == f"{NO_KEYBOARD}: {NO_WHITE_KEYS}"
    assert reading.keyboard is None
    assert reading.preferred_reading is None
    # what the reader saw stays, to tell why: no keyboard drawn on it
    assert sorted(p.name for p in tmp_path.iterdir()) == ["frame.png", "plate.png"]


def test_the_reader_can_be_sent_to_a_child_process() -> None:
    reader = pickle.loads(pickle.dumps(FallingNotesReader()))  # noqa: S301 - our own object

    assert isinstance(reader, FallingNotesReader)
