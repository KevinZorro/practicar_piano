"""Parsing of the local links file used by the Phase 0 command.

Format: one song per line, either ``URL`` or ``label | URL`` (the link is whatever follows
the last ``|``); blank lines and lines
starting with ``#`` are ignored. Errors report the line number only, never the link.
"""

from __future__ import annotations

from dataclasses import dataclass

from pianola.domain.errors import InvalidVideoUrlError
from pianola.domain.video_url import VideoUrl

_MAX_LABEL_LENGTH = 80


@dataclass(frozen=True, slots=True)
class SongEntry:
    index: int
    label: str
    url: VideoUrl


@dataclass(frozen=True, slots=True)
class LinkIssue:
    line_number: int
    reason: str


def parse_links(text: str) -> tuple[list[SongEntry], list[LinkIssue]]:
    entries: list[SongEntry] = []
    issues: list[LinkIssue] = []
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        label, _, raw_url = line.rpartition("|")  # labels may contain "|"; without one, label is ""
        try:
            url = VideoUrl.parse(raw_url)
        except InvalidVideoUrlError as exc:
            issues.append(LinkIssue(line_number, str(exc)))
            continue
        index = len(entries) + 1
        entries.append(SongEntry(index=index, label=_clean_label(label, index), url=url))
    return entries, issues


def _clean_label(label: str, index: int) -> str:
    cleaned = "".join(ch for ch in label.strip() if ch.isprintable() and ch not in "|`")
    return cleaned[:_MAX_LABEL_LENGTH] or f"song-{index:02d}"
