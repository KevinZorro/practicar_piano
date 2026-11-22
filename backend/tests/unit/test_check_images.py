"""The PNG images and the MIDI a person checks after a run."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

import numpy as np
import pytest
from numpy.typing import NDArray

from notacaida.domain.notes import NoteEvent
from notacaida.infrastructure.png import write_png
from notacaida.infrastructure.roll_image import PngRollPlotter


def read_png(path: Path) -> NDArray[np.uint8]:
    """Decode the PNGs ``write_png`` makes (8-bit RGB, one IDAT, no filters)."""
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    chunks, offset = {}, 8
    while offset < len(data):
        (length,) = struct.unpack(">I", data[offset : offset + 4])
        kind = data[offset + 4 : offset + 8]
        body = data[offset + 8 : offset + 8 + length]
        (crc,) = struct.unpack(">I", data[offset + 8 + length : offset + 12 + length])
        assert crc == zlib.crc32(kind + body)
        chunks[kind] = body
        offset += 12 + length
    width, height, depth, colour, *_ = struct.unpack(">IIBBBBB", chunks[b"IHDR"])
    assert (depth, colour) == (8, 2)
    rows = np.frombuffer(zlib.decompress(chunks[b"IDAT"]), np.uint8).reshape(height, -1)
    assert not rows[:, 0].any()  # filter "none" on every row
    return rows[:, 1:].reshape(height, width, 3)


def test_png_round_trips_the_pixels(tmp_path: Path) -> None:
    image = np.random.default_rng(1).integers(0, 256, (7, 5, 3), dtype=np.uint8)

    write_png(tmp_path / "deep" / "image.png", image)

    assert np.array_equal(read_png(tmp_path / "deep" / "image.png"), image)


def test_png_rejects_anything_but_rgb_bytes(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="uint8"):
        write_png(tmp_path / "x.png", np.zeros((4, 4), np.uint8))
    with pytest.raises(ValueError, match="uint8"):
        write_png(tmp_path / "x.png", np.zeros((4, 4, 3), np.float32))


def test_roll_shows_agreement_in_yellow_and_differences_in_red_or_green(tmp_path: Path) -> None:
    both, only_reference, only_estimate = (
        NoteEvent(60, 1.0, 2.0, 80),
        NoteEvent(64, 1.0, 2.0, 80),
        NoteEvent(67, 1.0, 2.0, 80),
    )

    PngRollPlotter().plot(
        tmp_path / "roll.png", [both, only_reference], [both, only_estimate], seconds=4.0
    )

    image = read_png(tmp_path / "roll.png")
    assert image.shape == (88 * 4, 200, 3)

    def pixel(pitch: int) -> tuple[int, ...]:
        return tuple(int(c) for c in image[(108 - pitch) * 4 + 1, 75])

    assert pixel(60) == (230, 230, 24)
    assert pixel(64) == (230, 24, 24)
    assert pixel(67) == (24, 230, 24)


def test_roll_skips_notes_outside_the_piano_and_after_the_window(tmp_path: Path) -> None:
    notes = [NoteEvent(10, 0.0, 1.0, 80), NoteEvent(60, 9.0, 10.0, 80)]

    PngRollPlotter().plot(tmp_path / "roll.png", notes, notes, seconds=2.0)

    assert int(read_png(tmp_path / "roll.png").max()) <= 48  # background and C lines only


def test_midi_writer_round_trips_through_the_reader(tmp_path: Path) -> None:
    pytest.importorskip("pretty_midi")
    from notacaida.infrastructure.midi_reader import PrettyMidiReader
    from notacaida.infrastructure.midi_writer import PrettyMidiWriter

    notes = (NoteEvent(60, 0.5, 1.0, 80), NoteEvent(64, 0.75, 1.5, 90), NoteEvent(67, 2.0, 2.0, 80))

    PrettyMidiWriter().write(notes, tmp_path / "out" / "video.mid")

    read = PrettyMidiReader().read(tmp_path / "out" / "video.mid")
    assert [(n.pitch, n.velocity) for n in read] == [(60, 80), (64, 90)]  # empty note dropped
    assert [n.start_s for n in read] == pytest.approx([0.5, 0.75], abs=0.01)
