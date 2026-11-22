"""Minimal PNG writer (stdlib zlib), for the images a person checks after a run."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

import numpy as np
from numpy.typing import NDArray


def write_png(path: Path, rgb: NDArray[np.uint8]) -> None:
    """Write an (height, width, 3) uint8 image as an 8-bit RGB PNG."""
    if rgb.ndim != 3 or rgb.shape[2] != 3 or rgb.dtype != np.uint8:
        raise ValueError("expected an (height, width, 3) uint8 image")
    height, width = rgb.shape[:2]
    rows = np.concatenate((np.zeros((height, 1), np.uint8), rgb.reshape(height, -1)), axis=1)

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows.tobytes(), 6))
        + chunk(b"IEND", b"")
    )
