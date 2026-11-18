from notacaida.application.build_result import BuildResult
from notacaida.domain.notes import NoteEvent, Transcription
from notacaida.domain.polyphony import max_polyphony
from tests.support.fakes import FakeScoreBuilder


def chord_song() -> Transcription:
    # twelve notes sounding together every half second, far beyond two hands
    notes = tuple(
        NoteEvent(40 + 3 * k, beat * 0.5, beat * 0.5 + 0.4, 80)
        for beat in range(16)
        for k in range(12)
    )
    return Transcription(notes, 8.0)


def test_every_level_is_delivered_and_only_reduced_ones_have_a_score() -> None:
    result = BuildResult(FakeScoreBuilder()).execute(chord_song())
    assert [lv.name for lv in result.levels] == ["original", "playable", "easy"]
    original, playable, easy = result.levels
    assert original.score is None
    assert playable.score is not None and easy.score is not None
    assert result.duration_s == 8.0


def test_levels_get_easier_and_stay_playable() -> None:
    original, playable, easy = BuildResult(FakeScoreBuilder()).execute(chord_song()).levels
    assert original.stats.max_polyphony_after == 12
    assert max_polyphony(playable.notes) <= 10
    assert max_polyphony(easy.notes) <= 8
    assert len(easy.notes) <= len(playable.notes) <= len(original.notes)


def test_empty_song_still_builds() -> None:
    result = BuildResult(FakeScoreBuilder()).execute(Transcription((), 5.0))
    assert all(lv.notes == () for lv in result.levels)
