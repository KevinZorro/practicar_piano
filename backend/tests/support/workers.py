"""Module-level functions: picklable work for the subprocess meter tests."""

from __future__ import annotations

import os
import time

from notacaida.domain.models import TranscriptionOutput


def succeed() -> TranscriptionOutput:
    return TranscriptionOutput(note_count=7, inference_seconds=0.5)


def fail() -> None:
    raise ValueError("model exploded")


def die() -> None:
    os._exit(9)  # simulates the kernel's OOM killer


def hang() -> None:
    time.sleep(30)


def allocate_megabytes() -> int:
    block = bytearray(120 * 1024 * 1024)
    block[::4096] = b"\x01" * len(block[::4096])  # touch every page so it becomes resident
    return len(block)
