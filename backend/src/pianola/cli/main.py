"""Command-line entry point (subcommands are added with the benchmark)."""

from __future__ import annotations

import sys
from collections.abc import Sequence


def main(argv: Sequence[str] | None = None) -> int:
    del argv
    sys.stderr.write("pianola: no command implemented yet\n")
    return 2
