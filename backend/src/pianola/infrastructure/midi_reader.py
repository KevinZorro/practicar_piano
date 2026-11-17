"""Reads the notes of a MIDI file written by a transcriber."""

from __future__ import annotations

from pathlib import Path

from pianola.domain.notes import NoteEvent


class PrettyMidiReader:
    """Needs the ``synth`` extra (pretty_midi)."""

    def read(self, midi_path: Path) -> tuple[NoteEvent, ...]:
        import pretty_midi

        midi = pretty_midi.PrettyMIDI(str(midi_path))
        notes = [
            NoteEvent(
                pitch=int(n.pitch),
                start_s=float(n.start),
                end_s=float(n.end),
                velocity=int(n.velocity),
            )
            for instrument in midi.instruments
            if not instrument.is_drum
            for n in instrument.notes
            if n.end > n.start
        ]
        return tuple(sorted(notes, key=lambda n: (n.start_s, n.pitch)))
