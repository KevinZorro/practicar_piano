"""Known notes to draw synthetic videos from, all generated in code (nothing copyrighted)."""

from __future__ import annotations

import random

from notacaida.domain.notes import NoteEvent

_ODE = "E E F G G F E D C C D E E D D - E E F G G F E D C C D E D C C -"
_STEPS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7}


def ode_to_joy(start_s: float = 1.0, bpm: float = 100.0) -> tuple[NoteEvent, ...]:
    """Beethoven's melody (public domain) in C over a left hand of broken chords."""
    beat = 60.0 / bpm
    notes: list[NoteEvent] = []
    for index, name in enumerate(_ODE.split()):
        onset = start_s + index * beat
        if name != "-":
            notes.append(NoteEvent(72 + _STEPS[name], onset, onset + 0.9 * beat, 80))
    for bar in range(len(_ODE.split()) // 4):
        root = (48, 43, 48, 43)[bar % 4]
        for i, pitch in enumerate((root, root + 7, root + 12, root + 7)):
            onset = start_s + (bar * 4 + i) * beat
            notes.append(NoteEvent(pitch, onset, onset + 0.95 * beat, 70))
    return _sorted(notes)


def stress(start_s: float = 1.0) -> tuple[NoteEvent, ...]:
    """The hard cases on purpose: every key, repeated notes, trills, clusters and big chords."""
    notes: list[NoteEvent] = []
    t = start_s
    for pitch in range(21, 109):  # chromatic run over all 88 keys
        notes.append(NoteEvent(pitch, t, t + 0.1, 80))
        t += 0.085
    t += 0.5
    for gap in (0.06, 0.03, 0.02):  # the same key again and again, ever closer
        for _ in range(6):
            notes.append(NoteEvent(67, t, t + 0.14 - gap, 80))
            t += 0.14
        t += 0.3
    for low, high in ((72, 74), (73, 75), (76, 77), (60, 61)):  # trills, white and black
        for i in range(10):
            pitch = low if i % 2 == 0 else high
            notes.append(NoteEvent(pitch, t, t + 0.075, 80))
            t += 0.08
        t += 0.3
    for chord in ((60, 61, 62, 63, 64), (48, 50, 52, 53, 55, 57, 59, 60), (62, 64), (71, 72)):
        notes.extend(NoteEvent(p, t, t + 0.6, 80) for p in chord)  # clusters and seconds
        t += 0.8
    ten = (36, 43, 48, 52, 55, 60, 64, 67, 72, 76)
    notes.extend(NoteEvent(p, t, t + 1.0, 80) for p in ten)
    t += 1.3
    notes.append(NoteEvent(29, t, t + 4.0, 80))  # a long bass under a fast melody
    for i in range(24):
        pitch = (79, 81, 83, 84, 86, 84, 83, 81)[i % 8]
        notes.append(NoteEvent(pitch, t + i * 0.16, t + i * 0.16 + 0.04, 80))
    return _sorted(notes)


def random_piece(seed: int, seconds: float = 60.0, start_s: float = 1.0) -> tuple[NoteEvent, ...]:
    """A plausible pop accompaniment: chords, broken-chord bass and a melody, reproducible."""
    rng = random.Random(seed)
    beat = 60.0 / rng.choice((72, 90, 110, 128))
    tonic = rng.randrange(12)
    sounding: dict[int, int] = {}  # pitch -> index of its last note
    notes: list[NoteEvent] = []

    def play(pitch: int, onset: float, length: float) -> None:
        last = sounding.get(pitch)
        if last is not None and notes[last].end_s > onset - 0.03:  # a key re-struck
            previous = notes[last]
            notes[last] = NoteEvent(pitch, previous.start_s, onset - 0.03, previous.velocity)
        sounding[pitch] = len(notes)
        notes.append(NoteEvent(pitch, onset, onset + length, rng.randint(50, 110)))

    t = start_s
    while t < seconds - 4 * beat:
        for degree, minor in ((0, False), (7, False), (9, True), (5, False)):
            root = 36 + (tonic + degree) % 12
            third = root + (3 if minor else 4)
            pattern = (root, root + 7, root + 12, third + 12)
            for i in range(8):  # broken chord in eighths, held like a pedal
                play(pattern[i % 4], t + i * beat / 2, rng.uniform(0.4, 1.0) * beat)
            melody_t = t
            while melody_t < t + 4 * beat - 1e-6:
                length = rng.choice((0.5, 0.5, 1.0, 1.0, 2.0)) * beat
                chord_tone = rng.choice((root, third, root + 7)) + 36
                pitch = chord_tone + rng.choice((0, 0, 2, -1, 12 if chord_tone < 72 else -12))
                play(pitch, melody_t, 0.92 * length)
                if rng.random() < 0.2:  # a chord in the right hand
                    play(
                        pitch - 4 if pitch - 4 != chord_tone else pitch - 5, melody_t, 0.9 * length
                    )
                melody_t += length
            t += 4 * beat
    return _sorted(notes)


def _sorted(notes: list[NoteEvent]) -> tuple[NoteEvent, ...]:
    return tuple(sorted(notes, key=lambda n: (n.start_s, n.pitch)))
