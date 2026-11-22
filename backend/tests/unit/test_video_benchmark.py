from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import pytest

from notacaida.application.links import SongEntry
from notacaida.application.video_benchmark import (
    TRUTH,
    BenchmarkTools,
    CompareVideoReading,
    VideoSongReport,
    compare,
)
from notacaida.domain.models import LocalAudio
from notacaida.domain.notes import NoteEvent
from notacaida.domain.quantize import Hand
from notacaida.domain.video_reading import NoteReading, ReadingMethod, VideoReading
from tests.support.fakes import (
    SCALE,
    FakeMidiReader,
    FakeMidiWriter,
    FakeRollPlotter,
    FakeSongMedia,
    FakeSynthesizer,
    FakeTranscriber,
    FakeVideoReader,
    InlineMeter,
)


def run(
    tmp_path: Path,
    *,
    media: FakeSongMedia | None = None,
    reader: FakeVideoReader | None = None,
    transcribers: Sequence[FakeTranscriber] = (),
    stems: Sequence[str] = ("song",),
    midi_notes: tuple[NoteEvent, ...] = SCALE,
) -> list[VideoSongReport]:
    tools = BenchmarkTools(
        midi_reader=FakeMidiReader(midi_notes),
        midi_writer=FakeMidiWriter(),
        meter=InlineMeter(),
        synthesizer=FakeSynthesizer(),
        plotter=FakeRollPlotter(),
    )
    entries = [
        SongEntry(i, stem, LocalAudio(tmp_path / f"{stem}.mp4"))
        for i, stem in enumerate(stems, start=1)
    ]
    benchmark = CompareVideoReading(
        media or FakeSongMedia(), reader or FakeVideoReader(), transcribers, tools
    )
    return benchmark.run(entries, tmp_path / "out", tmp_path / "work")


def pairs(song: VideoSongReport) -> set[tuple[str, str]]:
    return {(c.reference, c.estimate) for c in song.comparisons}


def test_every_reading_is_compared_with_the_truth_and_every_model(tmp_path: Path) -> None:
    models = [FakeTranscriber("basic-pitch"), FakeTranscriber("bytedance")]

    [song] = run(tmp_path, transcribers=models)

    assert song.error is None
    assert pairs(song) == {
        (reference, estimate)
        for reference in (TRUTH, "basic-pitch", "bytedance")
        for estimate in ("video:bars", "video:fused")
    } | {(TRUTH, "basic-pitch"), (TRUTH, "bytedance")}
    assert all(c.aligned.f1 == 1.0 for c in song.comparisons)
    assert [m.name for m in song.models] == ["basic-pitch", "bytedance"]
    assert all(m.note_count == len(SCALE) and m.usage for m in song.models)
    assert song.reading_usage is not None
    assert (song.duration_s, song.video_mb) == (10.0, 1.5)


def test_the_song_keeps_only_midi_wav_and_check_images(tmp_path: Path) -> None:
    media = FakeSongMedia()

    run(tmp_path, media=media, transcribers=[FakeTranscriber("basic-pitch")])

    [song_out] = (tmp_path / "out").iterdir()
    names = {p.name for p in song_out.iterdir()}
    assert names == {
        "keyboard.png",
        "roll.png",
        "video.mid",
        "video.wav",
        "basic-pitch.mid",
        "basic-pitch.wav",
    }
    assert not (tmp_path / "work").exists() or not any((tmp_path / "work").iterdir())
    assert all(not path.exists() for path in media.fetched)


def test_a_song_that_cannot_be_fetched_does_not_stop_the_run(tmp_path: Path) -> None:
    blocked, fine = run(tmp_path, stems=("blocked", "fine"))

    assert blocked.error == "blocked by fake"
    assert blocked.reading is None
    assert fine.error is None
    assert fine.comparisons


def test_a_video_that_cannot_be_decoded_is_reported(tmp_path: Path) -> None:
    [song] = run(tmp_path, reader=FakeVideoReader(fails=True))

    assert song.error == "lectura del video: ffmpeg failed: moov atom not found"
    assert song.duration_s == 10.0


def test_a_video_without_falling_notes_skips_the_models(tmp_path: Path) -> None:
    model = FakeTranscriber("bytedance")
    unreadable = VideoReading(failure="no se encontró un teclado dibujado", fps=30.0)

    [song] = run(tmp_path, reader=FakeVideoReader(unreadable), transcribers=[model])

    assert song.error is None
    assert song.reading == unreadable
    assert song.models == ()
    assert song.comparisons == ()
    assert model.audio_seen == []


def test_a_failing_model_is_reported_and_the_others_still_compared(tmp_path: Path) -> None:
    models = [FakeTranscriber("basic-pitch", fails=True), FakeTranscriber("bytedance")]

    [song] = run(tmp_path, transcribers=models, media=FakeSongMedia(truth=None))

    assert song.models[0].error == "model exploded"
    assert pairs(song) == {("bytedance", "video:bars"), ("bytedance", "video:fused")}


def test_without_sound_only_the_truth_is_compared(tmp_path: Path) -> None:
    model = FakeTranscriber("bytedance")

    [song] = run(tmp_path, media=FakeSongMedia(audio=False), transcribers=[model])

    assert song.models == ()
    assert pairs(song) == {(TRUTH, "video:bars"), (TRUTH, "video:fused")}


def test_hand_colours_are_compared_with_the_split_at_middle_c(tmp_path: Path) -> None:
    hands = (Hand.LEFT, Hand.RIGHT, Hand.RIGHT, Hand.RIGHT, None, Hand.LEFT, Hand.RIGHT, Hand.RIGHT)
    coloured = NoteReading(ReadingMethod.BARS, SCALE, hands)
    result = VideoReading(
        None, "88 teclas, A0-C8", 30.0, 300, 300, 240.0, False, (coloured,), coloured.method
    )

    [song] = run(tmp_path, reader=FakeVideoReader(result))

    # SCALE is C4 to G4, all right hand by pitch: 5 of the 7 coloured notes agree
    assert song.hand_split_agreement == pytest.approx(5 / 7)


def test_compare_removes_a_constant_delay_and_finds_a_misnamed_octave() -> None:
    late = tuple(NoteEvent(n.pitch + 12, n.start_s + 0.08, n.end_s + 0.08, 80) for n in SCALE)

    result = compare(TRUTH, SCALE, "video:bars", late)

    assert result.best_shift == -12
    assert result.delay_s == pytest.approx(0.08)
    assert result.aligned.f1 == 0.0  # an octave off: no note on its key
    assert result.shifted.f1 == 1.0


def test_compare_measures_the_delay_of_a_late_reading() -> None:
    late = tuple(NoteEvent(n.pitch, n.start_s + 0.08, n.end_s + 0.08, 80) for n in SCALE)

    result = compare(TRUTH, SCALE, "video:bars", late)

    assert result.onset.f1 == 0.0
    assert result.delay_s == pytest.approx(0.08)
    assert result.aligned.f1 == 1.0
    assert result.with_offsets.f1 == 1.0
