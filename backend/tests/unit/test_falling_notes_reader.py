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
from notacaida.infrastructure.falling_notes_reader import FallingNotesReader
from notacaida.infrastructure.ffmpeg_video import Crop, Frames, VideoInfo
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
    assert reading.preferred is ReadingMethod.FUSED
    assert reading.fall_speed_px_s == pytest.approx(180.0, rel=0.02)
    assert reading.frames == reading.frames_with_keyboard
    for method in ReadingMethod:
        found = reading.reading(method)
        assert found is not None
        assert agreement(notes, found.notes).f1 >= 0.98, method
    fused = reading.preferred_reading
    assert fused is not None
    assert abs(statistics.median(onset_errors(notes, fused.notes))) <= 0.015  # frame: 33 ms


def test_without_lit_keys_only_the_bars_are_read() -> None:
    notes = drawn(ode_to_joy(), BARS_ONLY)

    reading = read(notes, BARS_ONLY)

    assert not reading.lit_keys
    assert [r.method for r in reading.readings] == [ReadingMethod.BARS]
    assert reading.preferred is ReadingMethod.BARS
    bars = reading.preferred_reading
    assert bars is not None
    assert agreement(notes, bars.notes).f1 >= 0.98


def test_fast_repetitions_trills_and_chords_on_a_61_key_keyboard() -> None:
    notes = drawn(stress(), SMALL_61, until_s=30.0)

    reading = read(notes, SMALL_61)

    assert reading.keyboard == "61 teclas, C2-C7"
    fused = reading.preferred_reading
    assert fused is not None
    assert agreement(notes, fused.notes).f1 >= 0.97


def test_two_bar_colours_give_the_hands() -> None:
    notes = drawn(ode_to_joy(), LIT)

    fused = read(notes, LIT).preferred_reading

    assert fused is not None
    assert len(fused.hands) == len(fused.notes)
    same = sum(
        hand is assign_hand(n.pitch) for n, hand in zip(fused.notes, fused.hands, strict=True)
    )
    assert same / len(fused.notes) >= 0.95  # the drawing colours the hands by that split


def test_one_bar_colour_gives_no_hands() -> None:
    style = Style("one-colour", width=640, height=360, fall_px_s=180.0, left_colour=(90, 200, 110))
    notes = drawn(ode_to_joy(), style)

    reading = read(notes, style)

    assert all(r.hands == () for r in reading.readings)


def test_the_keyboard_check_image_is_written(tmp_path: Path) -> None:
    read(drawn(ode_to_joy(), LIT), LIT, tmp_path)

    assert (tmp_path / "keyboard.png").read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


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


def test_a_video_without_a_drawn_keyboard_is_reported_not_raised() -> None:
    reading = FallingNotesReader(BlankFrames()).read(VIDEO)

    assert reading.failure == "no se encontró un teclado dibujado"
    assert reading.keyboard is None
    assert reading.preferred_reading is None


def test_the_reader_can_be_sent_to_a_child_process() -> None:
    reader = pickle.loads(pickle.dumps(FallingNotesReader()))  # noqa: S301 - our own object

    assert isinstance(reader, FallingNotesReader)
