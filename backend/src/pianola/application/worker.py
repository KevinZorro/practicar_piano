"""The single worker: takes the next queued job and processes it off the event loop."""

from __future__ import annotations

import asyncio
import logging

from pianola.application.job_queue import JobQueue
from pianola.application.job_service import Sweep
from pianola.application.process_job import ProcessJob

logger = logging.getLogger(__name__)

_IDLE_POLL_S = 1.0
_SWEEP_EVERY_S = 60.0


class Worker:
    def __init__(self, queue: JobQueue, process: ProcessJob, sweep: Sweep) -> None:
        self._queue = queue
        self._process = process
        self._sweep = sweep

    async def run_next(self) -> bool:
        """Process one job if any is waiting. Returns whether a job was processed."""
        job_id = self._queue.next_job_id()
        if job_id is None:
            return False
        try:
            # ProcessJob blocks for minutes: keep it off the loop so the API stays responsive.
            await asyncio.to_thread(self._process.execute, job_id)
        finally:
            self._queue.finished(job_id)
        return True

    async def run_forever(self, stop: asyncio.Event) -> None:
        since_sweep = 0.0
        while not stop.is_set():
            worked = await self.run_next()
            if worked:
                continue
            await asyncio.sleep(_IDLE_POLL_S)
            since_sweep += _IDLE_POLL_S
            if since_sweep >= _SWEEP_EVERY_S:
                since_sweep = 0.0
                self._sweep.execute()
