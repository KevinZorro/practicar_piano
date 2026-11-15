"""Command-line entry point."""

from __future__ import annotations

from collections.abc import Sequence

from pianola.cli import phase0


def main(argv: Sequence[str] | None = None) -> int:
    args = phase0.main_args(argv)
    phase0.configure_logging(args.verbose)
    return phase0.handle(args)
