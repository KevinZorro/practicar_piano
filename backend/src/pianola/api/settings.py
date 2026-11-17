"""Runtime configuration read from environment variables (never hardcoded)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

_TRUE = frozenset({"1", "true", "yes", "on"})


@dataclass(frozen=True, slots=True)
class Settings:
    checkpoint_path: Path = Path("/models/note_F1=0.9677_pedal_F1=0.9186.pth")
    #: Where audio is written while a job runs; deleted after each job.
    work_dir: Path | None = None
    #: Residential proxy for yt-dlp (ADR 0015), e.g. ``socks5h://10.8.0.2:1080``.
    proxy_url: str | None = None
    max_duration_s: float = 600.0
    device: str = "cpu"
    #: Trust ``X-Real-IP`` from Nginx; only set it behind the proxy.
    trust_proxy: bool = False

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> Settings:
        defaults = cls()
        return cls(
            checkpoint_path=Path(
                env.get("PIANOLA_BYTEDANCE_CHECKPOINT", str(defaults.checkpoint_path))
            ),
            work_dir=Path(env["PIANOLA_WORK_DIR"]) if env.get("PIANOLA_WORK_DIR") else None,
            proxy_url=env.get("PIANOLA_PROXY_URL") or None,
            max_duration_s=float(env.get("PIANOLA_MAX_DURATION_SECONDS", defaults.max_duration_s)),
            device=env.get("PIANOLA_DEVICE", defaults.device),
            trust_proxy=env.get("PIANOLA_TRUST_PROXY", "").strip().lower() in _TRUE,
        )
