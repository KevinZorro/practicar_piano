"""Finds the drawn piano keyboard in a still of a falling-notes video (ADR 0023).

It works on the plate, the per-pixel median of many frames, where neither the falling bars
nor the lit keys remain:

* White-key rows: bright keys split by thin dark gaps at a regular step, at least two
  octaves of them; the lowest such band of rows in the picture.
* Black-key rows, right above: dark blocks over some of those gaps while the middle of every
  white key stays bright. Which gaps carry a block names every key (``domain.keyboard``).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from notacaida.domain.keyboard import name_keys

Image = NDArray[np.uint8]
Gray = NDArray[np.float32]

MIN_WHITE_KEYS = 15  # a little over two octaves: enough to name the keys
_LUMA = np.array([0.299, 0.587, 0.114], dtype=np.float32)
_SEARCH_FROM = 0.2  # keyboards sit in the lower 80 % of the picture
_SEPARATOR_REACH = 3  # px compared on each side of a gap between white keys
_MIN_SEPARATOR_DEPTH = 18.0  # luminance (0-255) a gap must be darker than its sides
_REGULAR_STEP = 0.2  # tolerated deviation from the white key width, as a fraction
_MIN_KEY_LEVEL = 110.0  # luminance of a white key
_GAP_WINDOW = 0.2  # half window around a gap, in white key widths, to look for a black key
_DARK_SHARE = 0.6  # share of that window a black key darkens
_MIN_BLACK_SHARE = 0.4  # share of gaps with a black key in a black-key row (5 of 6 normally)
_BRIGHT_CENTRE_SHARE = 0.8  # white key centres that stay bright in a black-key row
_NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


@dataclass(frozen=True, slots=True)
class Key:
    pitch: int
    is_black: bool
    left: float
    right: float

    @property
    def centre(self) -> float:
        return (self.left + self.right) / 2

    @property
    def width(self) -> float:
        return self.right - self.left


@dataclass(frozen=True, slots=True)
class Keyboard:
    keys: tuple[Key, ...]  # by pitch
    top: int  # first row of the keys
    black_bottom: int  # first row under the black keys
    bottom: int  # one past the last row of the white keys
    white_width: float
    mismatches: int = 0

    @property
    def left(self) -> int:
        return int(np.floor(min(k.left for k in self.keys)))

    @property
    def right(self) -> int:
        return int(np.ceil(max(k.right for k in self.keys)))

    def describe(self) -> str:
        low, high = self.keys[0].pitch, self.keys[-1].pitch
        return f"{len(self.keys)} teclas, {note_name(low)}-{note_name(high)}"


def note_name(pitch: int) -> str:
    return f"{_NOTE_NAMES[pitch % 12]}{pitch // 12 - 1}"


def luminance(image: Image) -> Gray:
    return np.asarray(image.astype(np.float32) @ _LUMA, dtype=np.float32)


def detect_keyboard(plate: Image) -> Keyboard | None:
    """The keyboard drawn in ``plate`` (height x width x RGB), or None if there is none."""
    gray = luminance(plate)
    band = _white_band(gray)
    if band is None:
        return None
    white_top, white_bottom, step = band
    grid = _white_edges(gray, white_top, white_bottom, step)
    if grid is None:
        return None
    edges, key_level = grid
    edges = np.clip(edges, 0, gray.shape[1]).astype(np.float32)  # an edge key may touch the border
    top = _black_top(gray, edges, white_top, key_level)
    if top is None:
        return None
    blacks = _black_keys(gray, edges, top, white_top, key_level)
    gaps = len(edges) - 2
    naming = name_keys([b is not None for b in blacks], max_mismatches=1 if gaps >= 20 else 0)
    if naming is None:
        return None
    width = float(np.median(np.diff(edges)))
    found = [b[1] - b[0] for b in blacks if b is not None]
    black_width = float(np.median(found)) if found else 0.6 * width
    keys = [
        Key(pitch, False, float(edges[i]), float(edges[i + 1]))
        for i, pitch in enumerate(naming.white_pitches)
    ]
    for i, pitch in enumerate(naming.black_pitches):
        if pitch is None:
            continue
        seen = blacks[i]
        gap = float(edges[i + 1])
        left, right = seen if seen else (gap - black_width / 2, gap + black_width / 2)
        keys.append(Key(pitch, True, left, right))
    return Keyboard(
        keys=tuple(sorted(keys, key=lambda k: k.pitch)),
        top=top,
        black_bottom=white_top,
        bottom=white_bottom,
        white_width=width,
        mismatches=naming.mismatches,
    )


def _separators(profile: Gray) -> NDArray[np.int64]:
    """Columns darker than both of their sides: the thin gaps between white keys."""
    reach, size = _SEPARATOR_REACH, profile.size
    padded = np.pad(profile, reach, mode="edge")
    left = np.max([padded[reach - k : reach - k + size] for k in range(1, reach + 1)], axis=0)
    right = np.max([padded[reach + k : reach + k + size] for k in range(1, reach + 1)], axis=0)
    spread = float(np.percentile(profile, 99) - np.percentile(profile, 1))
    depth = max(_MIN_SEPARATOR_DEPTH, 0.12 * spread)
    candidate = (np.minimum(left, right) - profile) >= depth
    edges = np.flatnonzero(np.diff(np.concatenate(([0], candidate.view(np.int8), [0]))))
    starts, stops = edges[::2], edges[1::2]
    return np.array(
        [
            start + int(np.argmin(profile[start:stop]))
            for start, stop in zip(starts, stops, strict=True)
        ],
        dtype=np.int64,
    )


def _white_step(profile: Gray) -> float | None:
    """Width of the white keys if this row crosses them, else None."""
    separators = _separators(profile)
    if separators.size < MIN_WHITE_KEYS - 1:
        return None
    gaps = np.diff(separators).astype(np.float32)
    step = float(np.median(gaps))
    regular = np.abs(gaps - step) <= _REGULAR_STEP * step + 1
    if step < 5 or regular.sum() < MIN_WHITE_KEYS - 2 or regular.mean() < 0.75:
        return None
    middles = ((separators[:-1] + separators[1:]) // 2)[regular]
    return step if float(np.median(profile[middles])) >= _MIN_KEY_LEVEL else None


def _white_band(gray: Gray) -> tuple[int, int, float] | None:
    """Rows [top, bottom) of the lowest band of white-key rows, and the key width."""
    height = gray.shape[0]
    min_rows = max(3, round(0.012 * height))
    run: list[tuple[int, float]] = []
    misses = 0
    for y in range(height - 1, int(height * _SEARCH_FROM) - 1, -1):
        step = _white_step(gray[y])
        # Rows through the black keys can show only the E|F and B|C gaps, regular enough to
        # pass on their own: a row belongs to the band only with the band's key width.
        if step is not None and (not run or abs(step - run[0][1]) <= _REGULAR_STEP * run[0][1]):
            run.append((y, step))
            misses = 0
            continue
        if run:
            misses += 1
            if misses > 2:
                if len(run) >= min_rows:
                    break
                run, misses = [], 0
    if len(run) < min_rows:
        return None
    rows = [y for y, _ in run]
    return min(rows), max(rows) + 1, float(np.median([s for _, s in run]))


def _white_edges(gray: Gray, top: int, bottom: int, step: float) -> tuple[Gray, float] | None:
    """Left edge of every white key plus the right edge of the last one, and their level."""
    span = bottom - top
    profile = gray[top + span // 5 : max(top + span // 5 + 1, bottom - span // 5)].mean(axis=0)
    separators = _separators(profile)
    if separators.size < MIN_WHITE_KEYS - 1:
        return None
    # Index each gap by counting whole key widths from the previous one (robust to a small
    # error in the median width), then fit a regular grid through them.
    index = np.concatenate(([0], np.cumsum(np.rint(np.diff(separators) / step)))).astype(int)
    keep = np.ones(separators.size, dtype=bool)
    for _ in range(3):
        slope, intercept = np.polyfit(index[keep], separators[keep], 1)
        residual = np.abs(separators - (intercept + slope * index))
        keep = residual <= 0.3 * slope
        if keep.sum() < MIN_WHITE_KEYS - 1:
            return None
    first, last = int(index[keep].min()), int(index[keep].max())
    centres = intercept + slope * (np.arange(first, last) + 0.5)
    key_level = float(
        np.median(profile[np.clip(np.rint(centres).astype(int), 0, profile.size - 1)])
    )

    def is_key(i: int) -> bool:  # the white key between grid lines i and i + 1
        lo, hi = round(intercept + slope * (i + 0.2)), round(intercept + slope * (i + 0.8))
        if lo < 0 or hi > profile.size or hi <= lo:
            return False
        return float(np.median(profile[lo:hi])) >= max(_MIN_KEY_LEVEL, 0.75 * key_level)

    while is_key(first - 1):
        first -= 1
    while is_key(last):
        last += 1
    if last - first < MIN_WHITE_KEYS:
        return None
    edges = intercept + slope * np.arange(first, last + 1, dtype=np.float32)
    return edges.astype(np.float32), key_level


def _gap_is_black(row: Gray, gap: float, width: float, threshold: float) -> bool:
    lo, hi = round(gap - _GAP_WINDOW * width), round(gap + _GAP_WINDOW * width) + 1
    window = row[max(lo, 0) : min(hi, row.size)]
    return window.size > 0 and float(np.mean(window < threshold)) >= _DARK_SHARE


def _black_top(gray: Gray, edges: Gray, white_top: int, key_level: float) -> int | None:
    """First row of the keys: the top of the rows where black keys sit on the gaps."""
    width = float(np.median(np.diff(edges)))
    threshold = 0.5 * key_level
    centres = np.rint((edges[:-1] + edges[1:]) / 2).astype(int)
    top, misses = None, 0
    for y in range(white_top - 1, -1, -1):
        row = gray[y]
        blacks = np.mean([_gap_is_black(row, gap, width, threshold) for gap in edges[1:-1]])
        bright = np.mean(row[centres] >= threshold)
        if blacks >= _MIN_BLACK_SHARE and bright >= _BRIGHT_CENTRE_SHARE:
            top, misses = y, 0
        else:
            misses += 1
            if misses > 2:
                break
    if top is None or white_top - top < 3:
        return None
    return top


def _black_keys(
    gray: Gray, edges: Gray, top: int, white_top: int, key_level: float
) -> list[tuple[float, float] | None]:
    """Extent of the black key over each gap between white keys (None where there is none)."""
    span = white_top - top
    profile = gray[top + span // 4 : max(top + span // 4 + 1, white_top - span // 4)].mean(axis=0)
    width = float(np.median(np.diff(edges)))
    dark = profile < 0.5 * key_level
    found: list[tuple[float, float] | None] = []
    for gap in edges[1:-1]:
        if not _gap_is_black(profile, float(gap), width, 0.5 * key_level):
            found.append(None)
            continue
        centre = round(float(gap))
        lo, hi = round(gap - _GAP_WINDOW * width), round(gap + _GAP_WINDOW * width)
        darkest = [x for x in range(max(lo, 0), min(hi + 1, dark.size)) if dark[x]]
        start = stop = min(darkest, key=lambda x: abs(x - centre))
        while start > 0 and dark[start - 1]:
            start -= 1
        while stop + 1 < dark.size and dark[stop + 1]:
            stop += 1
        extent = stop + 1 - start
        found.append(
            (float(start), float(stop + 1)) if 0.3 * width <= extent <= 0.9 * width else None
        )
    return found
