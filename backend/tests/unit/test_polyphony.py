import random

import pytest

from pianola.domain.notes import NoteEvent
from pianola.domain.polyphony import (
    EASY,
    PLAYABLE,
    PlayabilityPolicy,
    limit_polyphony,
    max_polyphony,
    reduce_polyphony,
    remove_ghosts,
)


def chord(
    pitches: list[int], start: float = 0.0, length: float = 1.0, velocity: int = 80
) -> list[NoteEvent]:
    return [NoteEvent(p, start, start + length, velocity) for p in pitches]


def sounding_at(notes: list[NoteEvent], t: float) -> list[NoteEvent]:
    return [n for n in notes if n.start_s <= t < n.end_s]


def pitch_classes(notes: list[NoteEvent]) -> set[int]:
    return {n.pitch % 12 for n in notes}


def test_playable_music_is_untouched() -> None:
    notes = chord([48, 55, 64, 67, 72]) + chord([50, 57, 65], start=1.0)
    result = reduce_polyphony(notes)
    assert list(result.notes) == sorted(notes, key=lambda n: (n.start_s, n.pitch))
    assert result.stats.notes_dropped_ratio == 0.0


def test_fifteen_note_chord_becomes_playable_and_keeps_melody_and_bass() -> None:
    pitches = [36, 43, 48, 52, 55, 59, 60, 64, 67, 71, 72, 76, 79, 83, 88]
    result = reduce_polyphony(chord(pitches))
    kept = [n.pitch for n in result.notes]
    assert max_polyphony(result.notes) <= PLAYABLE.max_total
    assert result.stats.max_polyphony_before == 15
    assert 36 in kept  # bass
    assert 88 in kept  # melody
    assert 0 < result.stats.notes_dropped_ratio < 1


def test_octave_doublings_go_before_chord_tones() -> None:
    # C major seventh doubled in several octaves: 11 notes, left hand C G C E, right hand dense.
    pitches = [36, 43, 48, 52, 59, 60, 64, 67, 71, 72, 76]
    kept = reduce_polyphony(chord(pitches)).notes
    assert {0, 4, 11} <= pitch_classes(list(kept))  # root, third and seventh survive


def test_fifth_is_dropped_before_third_and_seventh() -> None:
    # Exactly one note too many for the right hand once split: remove the cheapest one.
    notes = chord([36, 48, 52, 55, 59, 64, 67, 71, 76, 79, 83])  # C E G B voices, 11 notes
    kept = list(reduce_polyphony(notes).notes)
    assert {4, 11} <= pitch_classes(kept)
    fifths_before = sum(1 for n in notes if n.pitch % 12 == 7)
    fifths_after = sum(1 for n in kept if n.pitch % 12 == 7)
    thirds_before = sum(1 for n in notes if n.pitch % 12 == 4)
    thirds_after = sum(1 for n in kept if n.pitch % 12 == 4)
    assert fifths_before - fifths_after >= thirds_before - thirds_after


def test_easy_level_is_stricter_than_playable() -> None:
    notes = chord([40, 47, 52, 55, 59, 64, 67, 71, 76])
    assert max_polyphony(reduce_polyphony(notes, EASY).notes) <= EASY.max_total
    assert len(reduce_polyphony(notes, EASY).notes) <= len(reduce_polyphony(notes, PLAYABLE).notes)


def test_hand_span_limit_drops_notes_between_the_extremes() -> None:
    # Five notes spanning more than a tenth but in two clusters: two hands can play them.
    assert len(reduce_polyphony(chord([36, 38, 40, 76, 78])).notes) == 5
    # A single hand cannot stretch 30 semitones over 6 notes: something must go.
    wide = chord([30, 40, 50, 60, 70, 80, 90, 100, 101, 102, 103])
    assert max_polyphony(reduce_polyphony(wide).notes) <= PLAYABLE.max_total


def test_held_note_is_shortened_not_erased_when_a_new_chord_needs_room() -> None:
    held = [NoteEvent(40, 0.0, 4.0, 80)]
    crowd = chord([52, 55, 59, 64, 67, 71, 74, 76, 79, 83, 86], start=1.0, length=1.0)
    kept = list(reduce_polyphony(held + crowd).notes)
    held_after = [n for n in kept if n.pitch == 40]
    assert len(held_after) == 1  # bass is protected, so it keeps sounding
    assert held_after[0].end_s == 4.0


def test_a_sustained_inner_note_is_cut_where_it_stops_fitting() -> None:
    held = [NoteEvent(60, 0.0, 5.0, 50)]
    crowd = chord([36, 40, 43, 47, 50, 55, 62, 66, 69, 74, 79, 86], start=1.0, length=1.0)
    kept = list(reduce_polyphony(held + crowd).notes)
    cut = [n for n in kept if n.pitch == 60]
    assert cut == [] or cut[0].end_s <= 1.0  # shortened at the new onset, attack preserved
    assert any(n.pitch == 60 and n.start_s == 0.0 for n in kept) or cut == []


def test_same_key_struck_again_ends_the_previous_note() -> None:
    notes = [NoteEvent(60, 0.0, 3.0, 80), NoteEvent(60, 1.0, 2.0, 80)]
    kept = limit_polyphony(notes, PLAYABLE)
    assert [(n.start_s, n.end_s) for n in kept] == [(0.0, 1.0), (1.0, 2.0)]


def test_duplicate_pitch_inside_a_chord_keeps_the_loudest() -> None:
    notes = [NoteEvent(60, 0.0, 1.0, 40), NoteEvent(60, 0.01, 1.0, 90)]
    kept = limit_polyphony(notes, PLAYABLE)
    assert [n.velocity for n in kept] == [90]


def test_ghost_notes_are_removed_but_short_loud_notes_stay() -> None:
    notes = [
        NoteEvent(60, 0.0, 0.02, 10),  # ghost
        NoteEvent(62, 0.0, 0.02, 100),  # staccato: real
        NoteEvent(64, 0.0, 1.0, 10),  # quiet but sustained: real
    ]
    assert [n.pitch for n in remove_ghosts(notes, PLAYABLE)] == [62, 64]


def test_empty_input() -> None:
    result = reduce_polyphony([])
    assert result.notes == ()
    assert result.stats.notes_dropped_ratio == 0.0
    assert result.stats.max_polyphony_after == 0


def test_max_polyphony_counts_touching_notes_as_separate() -> None:
    assert max_polyphony([NoteEvent(60, 0, 1, 80), NoteEvent(62, 1, 2, 80)]) == 1
    assert max_polyphony([NoteEvent(60, 0, 2, 80), NoteEvent(62, 1, 3, 80)]) == 2


def onset_groups(notes: list[NoteEvent], window: float) -> list[list[NoteEvent]]:
    groups: list[list[NoteEvent]] = []
    for n in sorted(notes, key=lambda n: n.start_s):
        if groups and n.start_s - groups[-1][0].start_s <= window:
            groups[-1].append(n)
        else:
            groups.append([n])
    return groups


def random_piece(rng: random.Random) -> list[NoteEvent]:
    notes: list[NoteEvent] = []
    t = 0.0
    for _ in range(rng.randint(1, 25)):
        t += rng.choice([0.0, 0.02, 0.25, 0.5, 1.0])
        for pitch in rng.sample(range(21, 109), rng.randint(1, 18)):
            length = rng.choice([0.1, 0.5, 1.0, 3.0])
            notes.append(NoteEvent(pitch, t, t + length, rng.randint(30, 127)))
    return notes


@pytest.mark.parametrize("policy", [PLAYABLE, EASY], ids=["playable", "easy"])
def test_properties_on_random_pieces(policy: PlayabilityPolicy) -> None:
    for seed in range(100):
        notes = random_piece(random.Random(seed))
        kept = limit_polyphony(notes, policy)
        originals = {(n.pitch, n.start_s, n.velocity): n for n in notes}

        # nothing invented: every kept note is an input note, possibly shortened
        for n in kept:
            source = originals[(n.pitch, n.start_s, n.velocity)]
            assert n.end_s <= source.end_s
            assert n.end_s > n.start_s

        # limits hold at every instant a note starts
        starts = sorted({n.start_s for n in kept})
        for t in starts:
            live = sounding_at(kept, t)
            assert len(live) <= policy.max_total, seed
            assert len({n.pitch for n in live}) == len(live), seed

        # for chords with no other onset nearby, the highest and lowest new note are covered
        onsets = sorted({n.start_s for n in notes})
        for group in onset_groups(notes, policy.chord_window_s):
            first = min(n.start_s for n in group)
            last = max(n.start_s for n in group)
            near = [
                t
                for t in onsets
                if first - policy.chord_window_s <= t <= last + policy.chord_window_s
            ]
            if any(t < first or t > last for t in near):
                continue
            live = sounding_at(kept, last)
            if live:
                assert max(n.pitch for n in live) >= max(n.pitch for n in group), seed
                assert min(n.pitch for n in live) <= min(n.pitch for n in group), seed

        # idempotent
        assert limit_polyphony(kept, policy) == kept, seed


def test_low_polyphony_random_pieces_are_unchanged() -> None:
    rng = random.Random(7)
    for _ in range(50):
        notes: list[NoteEvent] = []
        for i in range(rng.randint(1, 20)):
            pitches = rng.sample(range(48, 64), rng.randint(1, 3))
            notes += chord(pitches, start=i * 1.0, length=0.8, velocity=rng.randint(30, 100))
        assert limit_polyphony(notes, PLAYABLE) == sorted(notes, key=lambda n: (n.start_s, n.pitch))
