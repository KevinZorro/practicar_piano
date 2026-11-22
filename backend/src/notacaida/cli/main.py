"""Command-line entry point."""

from __future__ import annotations

import argparse
from collections.abc import Sequence

from notacaida.cli import phase0, videonotes


def main_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="notacaida")
    parser.add_argument("-v", "--verbose", action="store_true")
    commands = parser.add_subparsers(dest="command", required=True)
    phase0.register(commands)
    videonotes.register(commands)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = main_args(argv)
    phase0.configure_logging(args.verbose)
    if args.command == "videonotes":
        return videonotes.handle(args)
    return phase0.handle(args)
