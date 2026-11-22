"""Writes synthetic falling-notes videos with their true notes, to measure the reader.

Each video gets a same-named ``.mid`` with the notes it was drawn from and a soundtrack
synthesized from them, so ``notacaida videonotes run --video-dir`` compares the reading and
the audio models with the truth. Nothing here is copyrighted: the pieces are generated in
code (``tests/support/pieces.py``) and the styles are generic (``falling_video.py``).

    uv run python -m tests.synthetic_videos --out ../synthetic-videos
    uv run notacaida videonotes run --video-dir ../synthetic-videos --out ../videonotes-synthetic
"""

from __future__ import annotations

import argparse
import tempfile
from collections.abc import Sequence
from pathlib import Path

from notacaida.domain.notes import NoteEvent
from notacaida.infrastructure.midi_writer import PrettyMidiWriter
from notacaida.infrastructure.synthesizer import AdditiveSynthesizer
from tests.support.falling_video import STYLES, Style, encode, render_frames
from tests.support.pieces import ode_to_joy, random_piece, stress

PIECES = {
    "estres": lambda: stress(),
    "oda": lambda: ode_to_joy(),
    "pop": lambda: random_piece(seed=11, seconds=75.0),
}


def write_video(notes: Sequence[NoteEvent], style: Style, path: Path) -> None:
    """``path`` (mp4) drawn from ``notes``, with their sound, and ``path.mid`` beside it."""
    visible = tuple(n for n in notes if style.low <= n.pitch <= style.high)
    truth = path.with_suffix(".mid")
    PrettyMidiWriter().write(visible, truth)
    duration = max(n.end_s for n in visible) + 1.5
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "sound.wav"
        AdditiveSynthesizer().render(truth, wav)
        encode(render_frames(visible, style, duration), style, path, audio=wav)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tests.synthetic_videos")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--styles", nargs="*", default=[s.name for s in STYLES])
    parser.add_argument("--pieces", nargs="*", default=list(PIECES))
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    for style in STYLES:
        if style.name not in args.styles:
            continue
        for name in args.pieces:
            path = args.out / f"{style.name}-{name}.mp4"
            if not path.exists():
                write_video(PIECES[name](), style, path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
