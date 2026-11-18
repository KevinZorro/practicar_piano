"""Runs work in a fresh child process and reports wall time and peak memory.

Each model gets its own process, so the peak resident memory (RSS) of one model is never
contaminated by another's, and a crash or out-of-memory kill is contained.
"""

from __future__ import annotations

import multiprocessing as mp
import resource
import time
import traceback
from collections.abc import Callable
from multiprocessing.connection import Connection
from typing import Any, TypeVar

from teclario.application.ports import Measured
from teclario.domain.errors import TranscriptionError
from teclario.domain.models import ResourceUsage

T = TypeVar("T")

_BYTES_PER_MB = 1024 * 1024
_DEFAULT_TIMEOUT_SECONDS = 1800.0


def _child_main(work: Callable[[], Any], conn: Connection) -> None:
    try:
        value = work()
        # ru_maxrss is in KiB on Linux.
        peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
        conn.send(("ok", value, peak_mb))
    except BaseException as exc:
        detail = f"{type(exc).__name__}: {exc}"
        conn.send(("error", detail, traceback.format_exc(limit=3)))
    finally:
        conn.close()


class SubprocessResourceMeter:
    def __init__(self, timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS) -> None:
        self._timeout_seconds = timeout_seconds
        self._context = mp.get_context("spawn")

    def measure(self, work: Callable[[], T]) -> Measured[T]:
        receiver, sender = self._context.Pipe(duplex=False)
        process = self._context.Process(target=_child_main, args=(work, sender))
        started = time.perf_counter()
        try:
            process.start()
        except Exception as exc:
            raise TranscriptionError(f"could not start worker process: {exc}") from exc
        finally:
            sender.close()

        message = self._wait_for_result(process, receiver)
        wall = time.perf_counter() - started
        process.join(timeout=10)
        if process.is_alive():
            process.kill()

        if message is None:
            raise TranscriptionError(
                f"worker died with exit code {process.exitcode} (possibly out of memory)"
            )
        if message[0] == "error":
            raise TranscriptionError(message[1])
        return Measured(value=message[1], usage=ResourceUsage(wall, float(message[2])))

    def _wait_for_result(self, process: Any, receiver: Connection) -> tuple[Any, ...] | None:
        try:
            if not receiver.poll(self._timeout_seconds):
                process.kill()
                raise TranscriptionError(f"worker timed out after {self._timeout_seconds:.0f}s")
            received: tuple[Any, ...] = receiver.recv()
            return received
        except EOFError:
            return None
        finally:
            receiver.close()
