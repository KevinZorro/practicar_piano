"""Draws falling-notes videos from known notes, to measure the video reader (ADR 0023).

Generic styles, not a copy of any product's look. They vary what real tutorials vary: bar
width and gaps, outlines, one colour per hand, lit keys or not, glow and sparks over the hit
line, a felt strip, lane lines, letters printed on the keys, a logo over the keyboard,
keyboard size, frame rate, resolution and compression.
"""

from __future__ import annotations

import subprocess
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from notacaida.domain.keyboard import white_key_pitches
from notacaida.domain.notes import NoteEvent
from notacaida.domain.quantize import Hand, assign_hand
from notacaida.infrastructure.ffmpeg_video import Crop, Frames, VideoInfo

Colour = tuple[int, int, int]
Image = NDArray[np.uint8]

#: Offset of each black key from the gap it sits on, in white key widths (as on a piano).
_BLACK_OFFSET = {1: -0.1, 3: 0.1, 6: -0.12, 8: 0.0, 10: 0.12}


@dataclass(frozen=True, slots=True)
class Style:
    name: str
    width: int = 854
    height: int = 480
    fps: float = 30.0
    low: int = 21  # leftmost key, a white key
    high: int = 108  # rightmost key, a white key
    keyboard_height: float = 0.17  # share of the frame height
    black_length: float = 0.62  # share of the keyboard height
    black_width: float = 0.58  # share of a white key width
    fall_px_s: float = 240.0
    background: Colour = (18, 18, 24)
    lanes: bool = False
    felt_px: int = 3
    right_colour: Colour = (90, 200, 110)
    left_colour: Colour = (80, 150, 230)
    black_shade: float = 0.7  # bars of black keys are darker
    white_bar: float = 0.84  # bar width over white key width
    black_bar: float = 1.0  # bar width over black key width
    outline: bool = True
    light_keys: bool = True
    glow: bool = False
    sparks: bool = False
    offset_black_keys: bool = True
    #: A dark letter near the bottom of every white key, as beginner tutorials print.
    key_labels: bool = False
    #: Bars drawn this many white keys to the right of their key: bars the reader misreads.
    bar_shift: float = 0.0
    #: A logo over a few keys during these (start, end) seconds.
    logo_s: tuple[tuple[float, float], ...] = ()
    crf: int = 26


STYLES = (
    Style("clasico"),
    Style("sin-teclas-iluminadas", light_keys=False, lanes=True, felt_px=0),
    Style("barras-juntas", white_bar=1.0, outline=False, felt_px=0, black_shade=1.0),
    Style(
        "neon",
        glow=True,
        sparks=True,
        right_colour=(255, 120, 40),
        left_colour=(40, 220, 255),
        background=(8, 6, 20),
        fall_px_s=320.0,
    ),
    Style("61-teclas-un-color", low=36, high=96, left_colour=(90, 200, 110), fall_px_s=200.0),
    Style("360p-comprimido", width=640, height=360, crf=33, fall_px_s=180.0),
    Style("720p-60fps", width=1280, height=720, fps=60.0, fall_px_s=420.0),
    Style("letras-en-las-teclas", key_labels=True),
)


@dataclass(frozen=True, slots=True)
class _Geometry:
    style: Style
    whites: tuple[int, ...]
    white_left: NDArray[np.float64]
    step: float
    top: int  # first keyboard row
    black_bottom: int
    hit: int  # first row the bars do not reach

    @classmethod
    def of(cls, style: Style) -> _Geometry:
        whites = [p for p in range(style.low, style.high + 1) if p % 12 in (0, 2, 4, 5, 7, 9, 11)]
        check = white_key_pitches(whites[0], len(whites))
        assert tuple(whites) == check  # a style must start and end on white keys
        step = style.width / len(whites)
        top = round(style.height * (1 - style.keyboard_height))
        black_bottom = top + round((style.height - top) * style.black_length)
        return cls(
            style,
            tuple(whites),
            np.arange(len(whites)) * step,
            step,
            top,
            black_bottom,
            top - style.felt_px,
        )

    def key_span(self, pitch: int) -> tuple[float, float]:
        if pitch in self.whites:
            left = float(self.white_left[self.whites.index(pitch)])
            return left, left + self.step
        gap = float(self.white_left[self.whites.index(pitch + 1)])
        offset = _BLACK_OFFSET[pitch % 12] * self.step if self.style.offset_black_keys else 0.0
        half = self.style.black_width * self.step / 2
        return gap + offset - half, gap + offset + half

    def bar_span(self, pitch: int) -> tuple[int, int]:
        left, right = self.key_span(pitch)
        share = self.style.black_bar if pitch not in self.whites else self.style.white_bar
        centre, half = (left + right) / 2, (right - left) * share / 2
        centre += self.style.bar_shift * self.step
        return round(centre - half), round(centre + half)

    @property
    def blacks(self) -> list[int]:
        return [p for p in range(self.style.low, self.style.high + 1) if p not in self.whites]


def render_frames(
    notes: Sequence[NoteEvent], style: Style, duration_s: float, seed: int = 7
) -> Iterator[Image]:
    geometry = _Geometry.of(style)
    plate = _plate(geometry)
    rng = np.random.default_rng(seed)
    hands = [assign_hand(n.pitch) for n in notes]
    lookahead = geometry.hit / style.fall_px_s
    for index in range(round(duration_s * style.fps)):
        t = index / style.fps
        frame = plate.copy()
        sounding = [(n, h) for n, h in zip(notes, hands, strict=True) if n.start_s <= t < n.end_s]
        visible = [
            (n, h)
            for n, h in zip(notes, hands, strict=True)
            if n.end_s > t and n.start_s < t + lookahead
        ]
        for note, hand in sorted(visible, key=lambda pair: pair[0].pitch not in geometry.whites):
            _draw_bar(frame, geometry, note, hand, t)
        if style.light_keys:
            _light_keys(frame, geometry, sounding)
        if style.sparks:
            _sparks(frame, geometry, sounding, rng)
        if any(start <= t < end for start, end in style.logo_s):
            _logo(frame, geometry)
        yield frame


def encode(frames: Iterator[Image], style: Style, path: Path, audio: Path | None = None) -> None:
    command = [
        "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{style.width}x{style.height}", "-r", f"{style.fps}", "-i", "pipe:0",
    ]  # fmt: skip
    if audio is not None:
        command += ["-i", str(audio), "-af", "apad", "-c:a", "aac", "-b:a", "96k", "-shortest"]
    command += ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(style.crf)]
    command += ["-pix_fmt", "yuv420p", "-g", str(round(style.fps * 2)), str(path)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)  # noqa: S603 - fixed argv
    assert process.stdin is not None
    for frame in frames:
        process.stdin.write(frame.tobytes())
    process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError("ffmpeg could not encode the synthetic video")


def _plate(geometry: _Geometry) -> Image:
    style = geometry.style
    image = np.empty((style.height, style.width, 3), dtype=np.uint8)
    image[:] = style.background
    if style.lanes:
        for pitch in geometry.whites:
            if pitch % 12 in (0, 5):
                x = round(geometry.key_span(pitch)[0])
                image[: geometry.hit, max(0, x)] = np.add(style.background, 14)
    if style.felt_px:
        image[geometry.hit : geometry.top] = (110, 20, 24)
    shade = np.linspace(205, 245, style.height - geometry.top)[:, None, None]
    image[geometry.top :] = np.broadcast_to(shade, (style.height - geometry.top, 1, 3))
    for pitch in geometry.whites[1:]:
        x = round(geometry.key_span(pitch)[0])
        image[geometry.top :, max(0, x - 1) : x + 1] = (70, 70, 74)
    if style.key_labels:
        for pitch in geometry.whites:
            _label(image, geometry, pitch)
    for pitch in geometry.blacks:
        _fill(image, geometry, pitch, (24, 24, 28), lit=False)
    return image


def _label(image: Image, geometry: _Geometry, pitch: int) -> None:
    """An "H"-like dark letter in the lower part of a white key, clear of its bottom edge."""
    left, right = geometry.key_span(pitch)
    lower = geometry.style.height - geometry.black_bottom
    bottom = geometry.style.height - round(0.3 * lower)
    top = bottom - max(4, round(0.3 * lower))
    centre, half = (left + right) / 2, max(2.0, 0.2 * (right - left))
    first, last = round(centre - half), round(centre + half)
    ink = (60, 60, 64)
    image[top:bottom, first : first + 2] = ink
    image[top:bottom, last - 1 : last + 1] = ink
    middle = (top + bottom) // 2
    image[middle : middle + 2, first:last] = ink


def _logo(frame: Image, geometry: _Geometry) -> None:
    """A light badge over the white keys from C4 to G4, as channels overlay their logo."""
    left, _ = geometry.key_span(60)
    _, right = geometry.key_span(67)
    frame[geometry.black_bottom + 2 : geometry.style.height - 3, round(left) : round(right)] = (
        235,
        190,
        60,
    )


def _fill(image: Image, geometry: _Geometry, pitch: int, colour: Colour, *, lit: bool) -> None:
    left, right = geometry.key_span(pitch)
    if pitch in geometry.whites:
        rows = slice(geometry.top, geometry.style.height - 2)
        image[rows, round(left) + 1 : round(right) - 1] = colour
    else:
        image[geometry.top : geometry.black_bottom, round(left) : round(right)] = colour
        if not lit:  # a faint highlight, as drawn keyboards often have
            highlight = round(left) + 2, round(left) + 3
            image[geometry.top + 2 : geometry.black_bottom - 4, highlight[0] : highlight[1]] = (
                60,
                60,
                66,
            )


def _colour(geometry: _Geometry, pitch: int, hand: Hand) -> Colour:
    style = geometry.style
    base = np.array(style.left_colour if hand is Hand.LEFT else style.right_colour, dtype=float)
    if pitch not in geometry.whites:
        base *= style.black_shade
    return tuple(int(c) for c in np.clip(base, 0, 255))  # type: ignore[return-value]


def _draw_bar(frame: Image, geometry: _Geometry, note: NoteEvent, hand: Hand, t: float) -> None:
    style = geometry.style
    bottom = round(geometry.hit - (note.start_s - t) * style.fall_px_s)
    top = round(geometry.hit - (note.end_s - t) * style.fall_px_s)
    clipped_bottom, clipped_top = bottom > geometry.hit, top < 0
    bottom, top = min(bottom, geometry.hit), max(top, 0)
    if bottom <= top:
        return
    left, right = geometry.bar_span(note.pitch)
    colour = _colour(geometry, note.pitch, hand)
    if style.glow:
        halo = tuple(int(c * 0.35) for c in colour)
        frame[max(top - 3, 0) : bottom, max(left - 3, 0) : right + 3] = np.maximum(
            frame[max(top - 3, 0) : bottom, max(left - 3, 0) : right + 3], halo
        )
    frame[top:bottom, left:right] = colour
    if style.outline and right - left > 4:
        edge = tuple(int(c * 0.45) for c in colour)
        frame[top:bottom, [left, right - 1]] = edge
        rows = [r for r, cut in ((top, clipped_top), (bottom - 1, clipped_bottom)) if not cut]
        if rows:
            frame[rows, left:right] = edge


def _light_keys(frame: Image, geometry: _Geometry, sounding: list[tuple[NoteEvent, Hand]]) -> None:
    lit = {n.pitch: _colour(geometry, n.pitch, h) for n, h in sounding}
    for pitch, colour in lit.items():
        if pitch in geometry.whites:
            _fill(frame, geometry, pitch, colour, lit=True)
    for pitch in geometry.blacks:  # black keys sit over the white ones
        if pitch in lit:
            _fill(frame, geometry, pitch, lit[pitch], lit=True)
        elif any(abs(pitch - p) == 1 for p in lit):
            _fill(frame, geometry, pitch, (24, 24, 28), lit=False)


def _sparks(
    frame: Image,
    geometry: _Geometry,
    sounding: list[tuple[NoteEvent, Hand]],
    rng: np.random.Generator,
) -> None:
    for note, hand in sounding:
        left, right = geometry.bar_span(note.pitch)
        colour = np.minimum(np.add(_colour(geometry, note.pitch, hand), 80), 255)
        for _ in range(4):
            x = int(rng.integers(max(left - 6, 0), min(right + 6, geometry.style.width - 2)))
            y = int(rng.integers(max(geometry.hit - 40, 0), geometry.hit - 1))
            frame[y : y + 2, x : x + 2] = colour


def plate(style: Style) -> Image:
    """The bare keyboard on its background, as the reader's plate should come out."""
    return _plate(_Geometry.of(style))


def key_span(style: Style, pitch: int) -> tuple[float, float]:
    """Columns [left, right) of the key drawn for ``pitch``."""
    return _Geometry.of(style).key_span(pitch)


def keyboard_rows(style: Style) -> tuple[int, int]:
    """First row of the keys and first row under the black keys."""
    geometry = _Geometry.of(style)
    return geometry.top, geometry.black_bottom


class MemoryFrames:
    """The reader's frame source drawn on the fly, without ffmpeg or a file (unit tests).

    Frames are exact (no compression); key frames are spread over the video like the ones
    ``FfmpegFrames`` samples from a short clip.
    """

    def __init__(self, notes: Sequence[NoteEvent], style: Style, duration_s: float) -> None:
        self._notes = tuple(notes)
        self._style = style
        self._duration_s = duration_s

    def probe(self, path: Path) -> VideoInfo:
        return VideoInfo(self._style.width, self._style.height, self._style.fps, self._duration_s)

    def key_frames(self, path: Path, info: VideoInfo, limit: int) -> Frames:
        total = round(self._duration_s * self._style.fps)
        wanted = set(np.linspace(0, total - 1, min(limit, total)).round().astype(int).tolist())
        return np.stack([f for i, f in enumerate(self._frames()) if i in wanted])

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
        first = round(start_s * info.fps)
        stop = None if duration_s is None else first + round(duration_s * info.fps)
        chunk: list[Image] = []
        for index, frame in enumerate(self._frames()):
            if index < first:
                continue
            if stop is not None and index >= stop:
                break
            if crop is not None:
                frame = frame[crop.y : crop.y + crop.height, crop.x : crop.x + crop.width]
            chunk.append(frame)
            if len(chunk) == batch:
                yield np.stack(chunk)
                chunk = []
        if chunk:
            yield np.stack(chunk)

    def _frames(self) -> Iterator[Image]:
        return render_frames(self._notes, self._style, self._duration_s)
