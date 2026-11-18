"""Validation and normalization of YouTube video links.

Only canonical links built from a validated 11-character video id ever reach the
downloader, which closes off SSRF through lookalike hosts, credentials in the URL,
ports, playlists and arbitrary paths.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit

from notacaida.domain.errors import InvalidVideoUrlError

_MAX_INPUT_LENGTH = 2048
_VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
_YOUTUBE_HOSTS = frozenset({"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"})
_SHORT_HOST = "youtu.be"
_ID_PATH_PREFIXES = ("shorts", "embed", "live", "v")


@dataclass(frozen=True, slots=True)
class VideoUrl:
    """A validated reference to one YouTube video."""

    video_id: str

    @classmethod
    def parse(cls, raw: str) -> VideoUrl:
        candidate = raw.strip()
        if not candidate or len(candidate) > _MAX_INPUT_LENGTH:
            raise InvalidVideoUrlError("empty or too long input")
        if any(ch.isspace() or ord(ch) < 32 for ch in candidate):
            raise InvalidVideoUrlError("whitespace or control characters in link")

        parts = urlsplit(candidate)
        if parts.scheme not in ("http", "https"):
            raise InvalidVideoUrlError("link must use http or https")
        if parts.username is not None or parts.password is not None:
            raise InvalidVideoUrlError("credentials are not allowed in the link")
        try:
            port = parts.port
        except ValueError as exc:
            raise InvalidVideoUrlError("invalid port") from exc
        if port is not None:
            raise InvalidVideoUrlError("explicit ports are not allowed")

        host = (parts.hostname or "").lower()
        video_id = cls._extract_id(host, parts.path, parts.query)
        if video_id is None or _VIDEO_ID.fullmatch(video_id) is None:
            raise InvalidVideoUrlError("not a YouTube video link")
        return cls(video_id=video_id)

    @staticmethod
    def _extract_id(host: str, path: str, query: str) -> str | None:
        segments = [segment for segment in path.split("/") if segment]
        if host == _SHORT_HOST:
            return segments[0] if len(segments) == 1 else None
        if host not in _YOUTUBE_HOSTS:
            return None
        if segments == ["watch"]:
            values = parse_qs(query).get("v", [])
            return values[0] if len(values) == 1 else None
        if len(segments) == 2 and segments[0] in _ID_PATH_PREFIXES:
            return segments[1]
        return None

    @property
    def canonical(self) -> str:
        """The only form passed to the downloader."""
        return f"https://www.youtube.com/watch?v={self.video_id}"

    @property
    def fingerprint(self) -> str:
        """Short stable hash, safe for logs and reports (never the link itself)."""
        return hashlib.sha256(self.video_id.encode()).hexdigest()[:10]

    def __repr__(self) -> str:
        return f"VideoUrl(fingerprint={self.fingerprint!r})"
