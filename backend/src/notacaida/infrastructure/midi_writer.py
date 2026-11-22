"""Writes notes as a MIDI file (one piano track)."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from notacaida.domain.notes import NoteEvent

_ACOUSTIC_GRAND = 0


class PrettyMidiWriter:
    """Needs the ``synth`` extra (pretty_midi)."""

    def write(self, notes: Sequence[NoteEvent], midi_path: Path) -> None:
        import pretty_midi

        midi = pretty_midi.PrettyMIDI()
        piano = pretty_midi.Instrument(program=_ACOUSTIC_GRAND, name="piano")
        piano.notes = [
            pretty_midi.Note(velocity=n.velocity, pitch=n.pitch, start=n.start_s, end=n.end_s)
            for n in notes
            if n.end_s > n.start_s
        ]
        midi.instruments.append(piano)
        midi_path.parent.mkdir(parents=True, exist_ok=True)
        midi.write(str(midi_path))
