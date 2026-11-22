"""Reads the notes of a falling-notes piano video (ADR 0023): classic vision, no AI.

Per video:

1. Plate: per-pixel median of the key frames (only I-frames are decoded). Bars move and keys
   light up only while they sound, so the median is the bare keyboard on an empty background.
2. Keyboard: ``keyboard_detector`` finds the keys and names them.
3. Calibration, on a few seconds of consecutive frames: the colour difference that separates
   a bar from the background, the hit line (where the bars stop) and the fall speed (the
   shift that maps the bars of one frame onto the next).
4. One pass over every frame, cropped by ffmpeg to the rows that matter:
   * bars: the strip just above the hit line is unrolled into a timeline finer than a frame,
     because the row ``d`` pixels above the hit line shows what lands ``d / speed`` seconds
     later; a key sounds while a bar covers the middle of its column;
   * keys: a key sounds while its own surface differs from the plate (it is lit).
5. Notes: runs of covered or lit time per key. When the keys light up, their notes are the
   reading: on real tutorials they agree with the audio far better than the bars, whose
   drawing varies more (2026-11-22, docs/phase-1/lectura-de-video.md). Bar colours split the
   hands when there are two; a lit note takes the hand of the bar that lands on it.
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

from notacaida.domain.agreement import ONSET_100MS, agreement, estimate_delay
from notacaida.domain.models import VideoFile
from notacaida.domain.notes import NoteEvent
from notacaida.domain.quantize import Hand
from notacaida.domain.video_reading import NoteReading, ReadingMethod, VideoReading
from notacaida.infrastructure.ffmpeg_video import Crop, FfmpegFrames, Frames, VideoInfo
from notacaida.infrastructure.keyboard_detector import Keyboard, find_keyboard
from notacaida.infrastructure.png import write_png

Mask = NDArray[np.bool_]
Floats = NDArray[np.float32]
Spans = NDArray[np.int64]  # (keys, 2): [start, stop) columns

_VELOCITY = 80  # the picture carries no loudness
_MIN_THRESHOLD, _MAX_THRESHOLD = 30, 110
_MIN_SPEED_PX_S, _MAX_SPEED_PX_S = 20.0, 4000.0
_MIN_BAR_SHARE = 0.003  # share of bar pixels for a frame to count when measuring the speed
_MAX_LIT_SHARE = 0.4  # more keys "lit" than this: the keyboard is not on screen
_MIN_LIT_NOTES = 8  # fewer lit notes: nothing lights up, or only a passing glitch
#: Median number of keys lit at once while any is: notes light a few, a hand over a filmed
#: keyboard or an overlay changes many.
_MAX_TYPICAL_LIT = 8
_MIN_LIT_AGREEMENT = 0.3  # lit keys the bars agree with at least this much are confirmed
#: Lit keys the bars do not confirm still count when they are this many, and at least this
#: share of the bar notes (a logo passing over a few keys of a video that lights none).
_MIN_UNCONFIRMED_LIT_NOTES = 20
_MIN_LIT_PER_BAR = 0.5
_HAND_SEPARATION = 0.05  # chromaticity distance between the two hand colours

NO_KEYBOARD = "no se encontró un teclado dibujado"


class FrameSource(Protocol):
    """The decoder the reader pulls frames from (``FfmpegFrames``; in memory in the tests)."""

    def probe(self, path: Path) -> VideoInfo: ...

    def key_frames(self, path: Path, info: VideoInfo, limit: int) -> Frames: ...

    def stream(
        self,
        path: Path,
        info: VideoInfo,
        *,
        crop: Crop | None = None,
        start_s: float = 0.0,
        duration_s: float | None = None,
        batch: int = 32,
    ) -> Iterator[Frames]: ...


@dataclass(frozen=True, slots=True)
class ReaderSettings:
    plate_frames: int = 32
    calibration_s: float = 4.0
    min_note_s: float = 0.025
    #: Gaps inside a bar shorter than this are noise (compression, a passing particle).
    max_gap_s: float = 0.012
    #: Share of a key's column a bar must cover, and of its surface that must change to be lit.
    covered_share: float = 0.5
    lit_share: float = 0.5
    batch_frames: int = 32


@dataclass(frozen=True, slots=True)
class Calibration:
    threshold: int  # colour difference from the plate that counts as "bar" or "lit"
    hit_line: int  # first row the bars do not reach
    speed_px_s: float


@dataclass(frozen=True, slots=True)
class _Layout:
    """Where each signal is read, as rows of the ffmpeg crop and columns of the keyboard."""

    crop: Crop
    band_rows: int  # rows [0, band_rows) of the crop: farthest from the hit line first
    nearest_delta: int  # distance in px from the last band row to the hit line
    colour_row: int
    white_rows: slice
    black_rows: slice
    bar_spans: Spans
    #: Left and right halves of ``bar_spans``: a bar must cover both, so a neighbour's bar
    #: reaching over one side of a black key does not light it.
    bar_halves: tuple[Spans, Spans]
    surface_spans: Spans
    is_black: NDArray[np.bool_]


@dataclass(slots=True)
class _Signals:
    coverage: Floats  # (bins, keys): share of each key's column under a bar, per landing pixel
    lit: Floats  # (frames, keys): share of each key's surface that changed
    colour: NDArray[np.uint8]  # (frames, keys, 3): colour in the middle of the band
    valid: Mask  # (frames,): the keyboard is on screen


class FallingNotesReader:
    """Implements ``VideoNoteReader``. Picklable, so the meter can run it in a child process."""

    def __init__(
        self, frames: FrameSource | None = None, settings: ReaderSettings | None = None
    ) -> None:
        self._frames: FrameSource = frames or FfmpegFrames()
        self._settings = settings or ReaderSettings()

    def read(self, video: VideoFile, debug_dir: Path | None = None) -> VideoReading:
        info = self._frames.probe(video.path)
        key_frames = self._frames.key_frames(video.path, info, self._settings.plate_frames)
        plate = np.median(key_frames, axis=0).astype(np.uint8)
        if debug_dir is not None:  # what the reader saw, to tell why a video was not read
            write_png(debug_dir / "plate.png", plate)
            write_png(debug_dir / "frame.png", key_frames[len(key_frames) // 2])
        del key_frames
        search = find_keyboard(plate)
        keyboard = search.keyboard
        if keyboard is None:
            return VideoReading(failure=f"{NO_KEYBOARD}: {search.failure}", fps=info.fps)
        calibration = self._calibrate(video.path, info, plate, keyboard)
        if debug_dir is not None:
            write_png(debug_dir / "keyboard.png", _overlay(plate, keyboard, calibration))
        if calibration is None:
            return VideoReading(
                failure="no se vieron barras cayendo a velocidad constante",
                keyboard=keyboard.describe(),
                fps=info.fps,
            )
        layout = _layout(keyboard, calibration, info)
        signals = self._scan(video.path, info, plate, layout, calibration)
        return _readings(keyboard, layout, calibration, signals, info, self._settings)

    def _calibrate(
        self, path: Path, info: VideoInfo, plate: NDArray[np.uint8], keyboard: Keyboard
    ) -> Calibration | None:
        height = min(keyboard.top, max(48, round(0.45 * keyboard.top)))
        if height < 24:
            return None
        crop = Crop(keyboard.left, keyboard.top - height, keyboard.right - keyboard.left, height)
        reference = _cropped(plate, crop)
        span = self._settings.calibration_s
        for start in (0.3, 0.55, 0.15, 0.75):
            begin = max(0.0, min(start * info.duration_s, info.duration_s - span))
            # every other column is plenty to calibrate and keeps 60 fps 720p video small
            differences = [
                _difference(batch[:, :, ::2], reference[:, ::2])
                for batch in self._frames.stream(
                    path, info, crop=crop, start_s=begin, duration_s=span
                )
            ]
            if sum(d.shape[0] for d in differences) < 10:
                continue
            difference = np.concatenate(differences)
            threshold = _otsu(difference)
            mask = difference >= threshold
            del difference, differences
            hit = _hit_row(mask.mean(axis=(0, 2)))
            if hit is None:
                continue
            per_frame = _fall_per_frame(mask[:, :hit])
            if per_frame is None:
                continue
            speed = per_frame * info.fps
            if _MIN_SPEED_PX_S <= speed <= _MAX_SPEED_PX_S:
                return Calibration(threshold, crop.y + hit, speed)
        return None

    def _scan(
        self,
        path: Path,
        info: VideoInfo,
        plate: NDArray[np.uint8],
        layout: _Layout,
        calibration: Calibration,
    ) -> _Signals:
        per_frame = calibration.speed_px_s / info.fps
        reference = _cropped(plate, layout.crop)
        frames_hint = math.ceil(info.duration_s * info.fps * 1.02) + 16
        keys = layout.bar_spans.shape[0]
        band = layout.band_rows
        reach = layout.nearest_delta + band  # px above the hit line of the first band row
        bins = math.ceil(frames_hint * per_frame) + reach + 2
        total = np.zeros((bins, keys), dtype=np.float32)
        count = np.zeros(bins, dtype=np.uint16)
        lit_parts: list[Floats] = []
        colour_parts: list[NDArray[np.uint8]] = []
        valid_parts: list[Mask] = []
        frame = 0
        batches: Iterator[Frames] = self._frames.stream(
            path, info, crop=layout.crop, batch=self._settings.batch_frames
        )
        for batch in batches:
            difference = _difference(batch, reference)
            hot = difference >= calibration.threshold
            lit = np.concatenate(
                (
                    _share(hot[:, layout.white_rows], layout.surface_spans[~layout.is_black]),
                    _share(hot[:, layout.black_rows], layout.surface_spans[layout.is_black]),
                ),
                axis=1,
            )
            lit = lit[:, np.argsort(np.concatenate(_key_order(layout.is_black)))]
            valid = (lit >= self._settings.lit_share).mean(axis=1) <= _MAX_LIT_SHARE
            left, right = layout.bar_halves
            covered = np.minimum(  # (batch, band, keys)
                _share_by_row(hot[:, :band], left), _share_by_row(hot[:, :band], right)
            )
            for offset in range(batch.shape[0]):
                if valid[offset]:
                    start = round((frame + offset) * per_frame) + layout.nearest_delta
                    if start + band > total.shape[0]:
                        total, count = _grow(total, count, start + band)
                    # band row 0 is the farthest from the hit line, so it lands last
                    total[start : start + band] += covered[offset, ::-1]
                    count[start : start + band] += 1
            lit_parts.append(lit.astype(np.float32))
            colour_parts.append(_mean_colour(batch[:, layout.colour_row], layout.bar_spans))
            valid_parts.append(valid)
            frame += batch.shape[0]
        coverage = np.divide(
            total, np.maximum(count, 1)[:, None], dtype=np.float32, out=np.zeros_like(total)
        )
        return _Signals(
            coverage=coverage,
            lit=np.concatenate(lit_parts) if lit_parts else np.zeros((0, keys), np.float32),
            colour=np.concatenate(colour_parts)
            if colour_parts
            else np.zeros((0, keys, 3), np.uint8),
            valid=np.concatenate(valid_parts) if valid_parts else np.zeros(0, bool),
        )


def _layout(keyboard: Keyboard, calibration: Calibration, info: VideoInfo) -> _Layout:
    per_frame = calibration.speed_px_s / info.fps
    nearest = max(2, round(0.01 * info.height))  # skip glow and sparks right at the hit line
    band = max(8, math.ceil(2.5 * per_frame))
    top = max(0, calibration.hit_line - nearest - band + 1)
    band = calibration.hit_line - nearest + 1 - top
    crop = Crop(keyboard.left, top, keyboard.right - keyboard.left, keyboard.bottom - top)
    upper = keyboard.black_bottom - keyboard.top
    lower = keyboard.bottom - keyboard.black_bottom
    shift = keyboard.top - top
    keys = keyboard.keys
    is_black = np.array([k.is_black for k in keys])
    cores = [_bar_core(keyboard, i) for i in range(len(keys))]
    return _Layout(
        crop=crop,
        band_rows=band,
        nearest_delta=nearest,
        colour_row=band // 2,
        white_rows=slice(
            shift + upper + lower // 4, shift + upper + max(lower // 4 + 1, lower - lower // 4)
        ),
        black_rows=slice(shift + upper // 4, shift + max(upper // 4 + 1, upper - upper // 5)),
        bar_spans=_spans(cores, crop.x, crop.width),
        bar_halves=(
            _spans([(lo, (lo + hi) / 2) for lo, hi in cores], crop.x, crop.width),
            _spans([((lo + hi) / 2, hi) for lo, hi in cores], crop.x, crop.width),
        ),
        surface_spans=_spans(
            [(k.left + 0.25 * k.width, k.right - 0.25 * k.width) for k in keys],
            crop.x,
            crop.width,
        ),
        is_black=is_black,
    )


def _bar_core(keyboard: Keyboard, index: int) -> tuple[float, float]:
    """Columns that only this key's bar covers: the middle of the key, clear of its
    neighbours (a white key's own part lies between the black keys beside it)."""
    key = keyboard.keys[index]
    if key.is_black:
        return key.left + 0.3 * key.width, key.right - 0.3 * key.width
    left, right = key.left, key.right
    for other in keyboard.keys[max(0, index - 2) : index + 3]:
        if other.is_black and other.right > left and other.left < right:
            if other.centre < key.centre:
                left = max(left, other.right)
            else:
                right = min(right, other.left)
    margin = 0.2 * (right - left)
    return left + margin, right - margin


def _spans(ranges: list[tuple[float, float]], origin: int, width: int) -> Spans:
    spans = []
    for lo, hi in ranges:
        start = int(np.clip(round(lo - origin), 0, width - 1))
        stop = int(np.clip(round(hi - origin), start + 1, width))
        spans.append((start, stop))
    return np.array(spans, dtype=np.int64)


def _key_order(is_black: NDArray[np.bool_]) -> tuple[Spans, Spans]:
    indices = np.arange(is_black.size)
    return indices[~is_black], indices[is_black]


def _cropped(image: NDArray[np.uint8], crop: Crop) -> NDArray[np.uint8]:
    return image[crop.y : crop.y + crop.height, crop.x : crop.x + crop.width]


def _difference(frames: Frames, reference: NDArray[np.uint8]) -> NDArray[np.uint8]:
    """Largest per-channel difference from the plate, per pixel.

    Channel by channel in uint8 (max - min cannot overflow); a reduction over the colour
    axis would be several times slower.
    """
    result: NDArray[np.uint8] | None = None
    for channel in range(3):
        a, b = frames[..., channel], reference[..., channel]
        difference = np.maximum(a, b) - np.minimum(a, b)
        result = difference if result is None else np.maximum(result, difference, out=result)
    assert result is not None  # noqa: S101 - three channels
    return result


def _otsu(values: NDArray[np.uint8]) -> int:
    """Threshold between the background and the bars (Otsu on the difference histogram)."""
    histogram = np.bincount(values.ravel(), minlength=256).astype(np.float64)
    levels = np.arange(256)
    weight = np.cumsum(histogram)
    mean = np.cumsum(histogram * levels)
    total, grand = weight[-1], mean[-1]
    between = (grand * weight - total * mean) ** 2 / np.maximum(weight * (total - weight), 1e-9)
    return int(np.clip(int(np.argmax(between[:-1])) + 1, _MIN_THRESHOLD, _MAX_THRESHOLD))


def _hit_row(activity: Floats) -> int | None:
    """First row the bars stop reaching, scanning up from the keyboard."""
    upper = activity[: activity.size // 2]
    reference = float(np.median(upper)) if upper.size else 0.0
    if reference < _MIN_BAR_SHARE:
        return None
    reached = np.flatnonzero(activity >= 0.35 * reference)
    return int(reached[-1]) + 1 if reached.size else None


def _fall_per_frame(mask: Mask) -> float | None:
    """Pixels the bars fall per frame: the shift that best maps one frame onto a later one."""
    frames, height = mask.shape[:2]
    busy = mask.mean(axis=(1, 2)) >= _MIN_BAR_SHARE
    limit = max(2, height // 3)
    pairs = [f for f in range(frames - 1) if busy[f] and busy[f + 1]][:: max(1, frames // 40)]
    coarse = [s for f in pairs if (s := _best_shift(mask[f], mask[f + 1], 0, limit)) > 0]
    if len(coarse) < 5:
        return None
    step = float(np.median(coarse))
    gap = max(1, int((height // 2) // max(step, 1.0)))
    if gap == 1:
        return step
    low, high = int(gap * step - gap), int(gap * step + gap)
    spread = [f for f in range(frames - gap) if busy[f] and busy[f + gap]][:: max(1, frames // 40)]
    fine = [_best_shift(mask[f], mask[f + gap], max(low, 1), min(high, height - 2)) for f in spread]
    fine = [s for s in fine if s > 0]
    return float(np.median(fine)) / gap if len(fine) >= 5 else step


def _best_shift(earlier: Mask, later: Mask, low: int, high: int) -> int:
    height = earlier.shape[0]
    best, best_score = 0, 0.0
    for shift in range(low, min(high, height - 1) + 1):
        before, after = earlier[: height - shift], later[shift:]
        union = np.count_nonzero(before | after)
        score = np.count_nonzero(before & after) / union if union else 0.0
        if score > best_score:
            best, best_score = shift, score
    return best


def _share(hot: Mask, spans: Spans) -> Floats:
    """Share of hot pixels inside each span, over all rows: (frames, rows, w) -> (frames, keys)."""
    if spans.size == 0:
        return np.zeros((hot.shape[0], 0), dtype=np.float32)
    return np.asarray(_share_by_row(hot, spans).mean(axis=1), dtype=np.float32)


def _share_by_row(hot: Mask, spans: Spans) -> Floats:
    """Share of hot pixels inside each span, per row: (frames, rows, w) -> (frames, rows, keys)."""
    summed = np.cumsum(hot, axis=-1, dtype=np.int32)
    summed = np.concatenate((np.zeros((*summed.shape[:-1], 1), np.int32), summed), axis=-1)
    inside = summed[..., spans[:, 1]] - summed[..., spans[:, 0]]
    return np.asarray(inside / (spans[:, 1] - spans[:, 0]), dtype=np.float32)


def _mean_colour(row: Frames, spans: Spans) -> NDArray[np.uint8]:
    """Mean RGB of each span of one row: (frames, w, 3) -> (frames, keys, 3)."""
    summed = np.cumsum(row.astype(np.int32), axis=1)
    summed = np.concatenate((np.zeros((row.shape[0], 1, 3), np.int32), summed), axis=1)
    inside = summed[:, spans[:, 1]] - summed[:, spans[:, 0]]
    return np.asarray(inside / (spans[:, 1] - spans[:, 0])[None, :, None], dtype=np.uint8)


def _grow(
    total: Floats, count: NDArray[np.uint16], needed: int
) -> tuple[Floats, NDArray[np.uint16]]:
    extra = max(needed - total.shape[0], total.shape[0] // 4)
    return (
        np.concatenate((total, np.zeros((extra, total.shape[1]), np.float32))),
        np.concatenate((count, np.zeros(extra, np.uint16))),
    )


def _runs(active: Mask, max_gap: int, min_length: int) -> list[tuple[int, int]]:
    """[start, stop) of the True runs, joining gaps up to ``max_gap`` and dropping short runs."""
    edges = np.flatnonzero(np.diff(np.concatenate(([0], active.view(np.int8), [0]))))
    runs: list[tuple[int, int]] = []
    for start, stop in zip(edges[::2].tolist(), edges[1::2].tolist(), strict=True):
        if runs and start - runs[-1][1] <= max_gap:
            runs[-1] = (runs[-1][0], stop)
        else:
            runs.append((start, stop))
    return [(a, b) for a, b in runs if b - a >= min_length]


def _readings(
    keyboard: Keyboard,
    layout: _Layout,
    calibration: Calibration,
    signals: _Signals,
    info: VideoInfo,
    settings: ReaderSettings,
) -> VideoReading:
    speed, fps, origin = calibration.speed_px_s, info.fps, info.start_s
    pitches = [k.pitch for k in keyboard.keys]
    bar_runs = [
        _runs(
            signals.coverage[:, k] >= settings.covered_share,
            max_gap=max(1, round(settings.max_gap_s * speed)),
            min_length=max(2, round(settings.min_note_s * speed)),
        )
        for k in range(len(pitches))
    ]

    def landing(px: int) -> float:  # reached landing pixel ``px`` but not ``px - 1``
        return origin + (px - 0.5) / speed

    bars = [
        (NoteEvent(pitches[k], landing(a), landing(b), _VELOCITY), k)
        for k, runs in enumerate(bar_runs)
        for a, b in runs
    ]
    bars.sort(key=lambda pair: (pair[0].start_s, pair[0].pitch))
    lit = (signals.lit >= settings.lit_share) & signals.valid[:, None]
    shortest = max(1, round(settings.min_note_s * fps))
    keys = [
        (NoteEvent(pitches[k], origin + (a - 0.5) / fps, origin + (b - 0.5) / fps, _VELOCITY), k)
        for k in range(len(pitches))
        for a, b in _runs(lit[:, k], max_gap=0, min_length=shortest)
    ]
    keys.sort(key=lambda pair: (pair[0].start_s, pair[0].pitch))
    bar_notes, lit_notes = [n for n, _ in bars], [n for n, _ in keys]
    hands = _hands(bars, signals, layout, calibration, info)
    readings = [NoteReading(ReadingMethod.BARS, tuple(bar_notes), hands)]
    delay = agreeing = None
    if bar_notes and lit_notes:
        delay = estimate_delay(lit_notes, bar_notes)
        agreeing = agreement(lit_notes, bar_notes, ONSET_100MS, time_shift_s=-(delay or 0.0)).f1
    lit_keys = _lit_keys_look_real(lit_notes, bar_notes, lit, agreeing)
    if lit_keys:
        readings.append(
            NoteReading(
                ReadingMethod.KEYS,
                tuple(lit_notes),
                _hands_of_lit_notes(keys, bars, hands, delay or 0.0, fps),
            )
        )
    return VideoReading(
        failure=None,
        keyboard=keyboard.describe(),
        fps=fps,
        frames=int(signals.valid.size),
        frames_with_keyboard=int(signals.valid.sum()),
        fall_speed_px_s=speed,
        lit_keys=lit_keys,
        bar_key_agreement=agreeing,
        bar_delay_s=delay,
        readings=tuple(readings),
        preferred=ReadingMethod.KEYS if lit_keys else ReadingMethod.BARS,
    )


def _lit_keys_look_real(
    lit_notes: list[NoteEvent], bar_notes: list[NoteEvent], lit: Mask, agreeing: float | None
) -> bool:
    """Whether the keys light up as notes do: often enough and only a few at a time.

    The bars confirm them when both agree. Bars that disagree do not overrule them: on real
    tutorials the bars are the reading that goes wrong, unless the keys light up far less
    often than bars land.
    """
    if len(lit_notes) < _MIN_LIT_NOTES:
        return False
    at_once = lit.sum(axis=1)
    if float(np.median(at_once[at_once > 0])) > _MAX_TYPICAL_LIT:
        return False
    if agreeing is not None and agreeing >= _MIN_LIT_AGREEMENT:
        return True
    return len(lit_notes) >= max(_MIN_UNCONFIRMED_LIT_NOTES, _MIN_LIT_PER_BAR * len(bar_notes))


def _hands_of_lit_notes(
    keys: list[tuple[NoteEvent, int]],
    bars: list[tuple[NoteEvent, int]],
    hands: tuple[Hand | None, ...],
    delay: float,
    fps: float,
) -> tuple[Hand | None, ...]:
    """Hand of each lit note: that of the bar landing on its key when it lights up, once the
    constant ``delay`` of the bars against the keys is removed; () without hand colours."""
    if not hands:
        return ()
    tolerance = max(2.0 / fps, 0.06)
    landings: dict[int, list[tuple[float, Hand | None]]] = {}
    for (bar, key), hand in zip(bars, hands, strict=True):
        landings.setdefault(key, []).append((bar.start_s - delay, hand))
    found: list[Hand | None] = []
    for note, key in keys:
        nearest = min(
            landings.get(key, []), key=lambda pair: abs(pair[0] - note.start_s), default=None
        )
        if nearest is not None and abs(nearest[0] - note.start_s) <= tolerance:
            found.append(nearest[1])
        else:
            found.append(None)
    return tuple(found)


def _hands(
    bars: list[tuple[NoteEvent, int]],
    signals: _Signals,
    layout: _Layout,
    calibration: Calibration,
    info: VideoInfo,
) -> tuple[Hand | None, ...]:
    """Hand of each bar note when the bars come in two colours, else ()."""
    if len(bars) < 8 or signals.colour.shape[0] == 0:
        return ()
    delta = layout.nearest_delta + (layout.band_rows - 1 - layout.colour_row)
    lead = delta / calibration.speed_px_s  # a bar crosses the colour row this early
    frames = signals.colour.shape[0]
    chroma = np.zeros((len(bars), 2), dtype=np.float64)
    for i, (note, key) in enumerate(bars):
        length = note.end_s - note.start_s
        first = (note.start_s + 0.2 * length - lead - info.start_s) * info.fps
        last = (note.end_s - 0.2 * length - lead - info.start_s) * info.fps
        lo = int(np.clip(math.ceil(first), 0, frames - 1))
        hi = int(np.clip(math.floor(last), lo, frames - 1)) + 1
        rgb = np.median(signals.colour[lo:hi, key].astype(np.float64), axis=0)
        chroma[i] = rgb[:2] / (rgb.sum() + 1.0)
    labels = _two_means(chroma)
    if labels is None:
        return ()
    black = layout.is_black[[key for _, key in bars]]
    shares = [float(black[labels == cluster].mean()) for cluster in (0, 1)]
    if max(shares) > 0.85 and min(shares) < 0.15:
        return ()  # the colours split black keys from white keys, not the hands
    pitch = np.array([note.pitch for note, _ in bars])
    left = 0 if np.median(pitch[labels == 0]) < np.median(pitch[labels == 1]) else 1
    return tuple(Hand.LEFT if label == left else Hand.RIGHT for label in labels)


def _two_means(points: NDArray[np.float64]) -> NDArray[np.int64] | None:
    """Labels of a clear split of ``points`` into two groups, or None when there is one."""
    first = points[np.argmax(np.linalg.norm(points - points.mean(axis=0), axis=1))]
    second = points[np.argmax(np.linalg.norm(points - first, axis=1))]
    centres = np.stack((first, second))
    labels = np.zeros(len(points), dtype=np.int64)
    for _ in range(12):
        distances = np.linalg.norm(points[:, None, :] - centres[None, :, :], axis=2)
        labels = np.argmin(distances, axis=1)
        if labels.min() == labels.max():
            return None
        centres = np.stack([points[labels == c].mean(axis=0) for c in (0, 1)])
    separation = float(np.linalg.norm(centres[0] - centres[1]))
    spread = max(
        float(np.linalg.norm(points[labels == c] - centres[c], axis=1).mean()) for c in (0, 1)
    )
    share = min(np.mean(labels == 0), np.mean(labels == 1))
    if separation < _HAND_SEPARATION or spread > 0.5 * separation or share < 0.1:
        return None
    return labels


def _overlay(
    plate: NDArray[np.uint8], keyboard: Keyboard, calibration: Calibration | None
) -> NDArray[np.uint8]:
    """The plate with what was detected drawn on it, for a person to check at a glance."""
    image = plate.copy()
    height, width = image.shape[:2]
    for row, colour in (
        (keyboard.top, (0, 200, 255)),
        (keyboard.black_bottom, (0, 200, 255)),
        (keyboard.bottom - 1, (0, 200, 255)),
    ):
        image[min(row, height - 1), keyboard.left : keyboard.right] = colour
    if calibration is not None:
        image[max(calibration.hit_line - 1, 0), :] = (255, 40, 40)
    for key in keyboard.keys:
        left = int(np.clip(round(key.left), 0, width - 1))
        right = int(np.clip(round(key.right) - 1, 0, width - 1))
        if key.is_black:
            image[keyboard.top : keyboard.black_bottom, [left, right]] = (255, 140, 0)
        else:
            image[keyboard.black_bottom : keyboard.bottom, left] = (120, 120, 120)
        if key.pitch % 12 == 0:  # every C, middle C in green
            colour = (0, 200, 0) if key.pitch == 60 else (40, 90, 255)
            marker = slice(max(keyboard.bottom - 8, keyboard.black_bottom), keyboard.bottom)
            centre = int(np.clip(round(key.centre), 2, width - 3))
            image[marker, centre - 2 : centre + 3] = colour
    return image
