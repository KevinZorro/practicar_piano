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
from notacaida.domain.video_reading import (
    NoteReading,
    OctaveEstimate,
    ReadingMethod,
    VideoReading,
)
from tests.support.fakes import (
    SCALE,
    FakeMidiReader,
    FakeMidiWriter,
    FakeOctaveEstimator,
    FakeRollPlotter,
    FakeSongMedia,
    FakeSynthesizer,
    FakeTranscriber,
    FakeVideoReader,
    InlineMeter,
    video_reading,
)


def run(
    tmp_path: Path,
    *,
    media: FakeSongMedia | None = None,
    reader: FakeVideoReader | None = None,
    transcribers: Sequence[FakeTranscriber] = (),
    stems: Sequence[str] = ("song",),
    midi_notes: tuple[NoteEvent, ...] = SCALE,
    reuse_from: Sequence[Path] | None = None,
    synthesizer: FakeSynthesizer | None = None,
    octave: FakeOctaveEstimator | None = None,
) -> list[VideoSongReport]:
    tools = BenchmarkTools(
        midi_reader=FakeMidiReader(midi_notes),
        midi_writer=FakeMidiWriter(),
        meter=InlineMeter(),
        synthesizer=synthesizer or FakeSynthesizer(),
        plotter=FakeRollPlotter(),
        octave=octave,
    )
    entries = [
        SongEntry(i, stem, LocalAudio(tmp_path / f"{stem}.mp4"))
        for i, stem in enumerate(stems, start=1)
    ]
    benchmark = CompareVideoReading(
        media or FakeSongMedia(),
        reader or FakeVideoReader(),
        transcribers,
        tools,
        reuse_from=reuse_from,
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
        for estimate in ("video:bars", "video:keys")
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
        "plate.png",
        "frame.png",
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
    assert pairs(song) == {("bytedance", "video:bars"), ("bytedance", "video:keys")}


def test_without_sound_only_the_truth_is_compared(tmp_path: Path) -> None:
    model = FakeTranscriber("bytedance")

    [song] = run(tmp_path, media=FakeSongMedia(audio=False), transcribers=[model])

    assert song.models == ()
    assert pairs(song) == {(TRUTH, "video:bars"), (TRUTH, "video:keys")}


def test_hand_colours_are_compared_with_the_split_at_middle_c(tmp_path: Path) -> None:
    hands = (Hand.LEFT, Hand.RIGHT, Hand.RIGHT, Hand.RIGHT, None, Hand.LEFT, Hand.RIGHT, Hand.RIGHT)
    coloured = NoteReading(ReadingMethod.BARS, SCALE, hands)
    result = VideoReading(
        failure=None,
        keyboard="88 teclas, A0-C8",
        fps=30.0,
        frames=300,
        frames_with_keyboard=300,
        fall_speed_px_s=240.0,
        readings=(coloured,),
        preferred=coloured.method,
    )

    [song] = run(tmp_path, reader=FakeVideoReader(result))

    # SCALE is C4 to G4, all right hand by pitch: 5 of the 7 coloured notes agree
    assert song.hand_split_agreement == pytest.approx(5 / 7)


def test_a_rerun_can_reuse_the_transcriptions_of_an_earlier_run(tmp_path: Path) -> None:
    run(tmp_path, transcribers=[FakeTranscriber("bytedance")])
    again, synthesizer = FakeTranscriber("bytedance"), FakeSynthesizer()

    [song] = run(tmp_path, transcribers=[again], reuse_from=[], synthesizer=synthesizer)

    assert again.audio_seen == []  # the model did not run again
    [model] = song.models
    assert model.reused
    assert model.usage is None
    assert model.note_count == len(SCALE)  # read back from the MIDI left by the first run
    assert pairs(song) >= {("bytedance", "video:bars"), ("bytedance", "video:keys")}
    assert [p.name for p in synthesizer.rendered] == ["video.wav"]  # its WAV is still there


def test_the_phase0_transcriptions_can_be_reused_whatever_their_index(tmp_path: Path) -> None:
    fingerprint = LocalAudio(tmp_path / "song.mp4").fingerprint
    phase0 = tmp_path / "phase0-output"
    (phase0 / f"07-{fingerprint}").mkdir(parents=True)  # another song list, another index
    (phase0 / f"07-{fingerprint}" / "bytedance.mid").write_bytes(b"MThd")
    again = FakeTranscriber("bytedance")

    [song] = run(tmp_path, transcribers=[again], reuse_from=[phase0])

    assert again.audio_seen == []
    assert song.models[0].reused
    [song_out] = (tmp_path / "out").iterdir()
    assert (song_out / "bytedance.mid").read_bytes() == b"MThd"  # copied beside the reading
    assert (song_out / "bytedance.wav").exists()


def test_a_song_with_nothing_to_reuse_is_transcribed(tmp_path: Path) -> None:
    model = FakeTranscriber("bytedance")

    [song] = run(tmp_path, transcribers=[model], reuse_from=[tmp_path / "missing"])

    assert len(model.audio_seen) == 1
    assert not song.models[0].reused
    assert song.models[0].usage is not None


def test_without_reuse_a_rerun_transcribes_again(tmp_path: Path) -> None:
    run(tmp_path, transcribers=[FakeTranscriber("bytedance")])
    again = FakeTranscriber("bytedance")

    [song] = run(tmp_path, transcribers=[again])

    assert len(again.audio_seen) == 1
    assert not song.models[0].reused


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


def lowered(semitones: int) -> VideoReading:
    """A reading of a keyboard whose octave was guessed, naming the keys too low."""
    return video_reading(
        tuple(NoteEvent(n.pitch - semitones, n.start_s, n.end_s, n.velocity) for n in SCALE),
        octave_guessed=True,
    )


def heard(shift: int, margin: float = 2.0) -> OctaveEstimate:
    return OctaveEstimate(shift=shift, margin=margin, notes_used=8, scores=((0, 0.0), (shift, 1.0)))


def test_a_guessed_octave_is_corrected_with_the_one_heard_in_the_song(tmp_path: Path) -> None:
    estimator = FakeOctaveEstimator(heard(24))

    [song] = run(
        tmp_path,
        reader=FakeVideoReader(lowered(24)),
        transcribers=[FakeTranscriber("bytedance")],
        octave=estimator,
    )

    assert song.octave == heard(24)
    assert song.reading is not None and song.reading.octave_shift == 24
    assert [n.pitch for n in estimator.asked[0]] == [n.pitch - 24 for n in SCALE]  # as read
    # the comparison is made on the corrected notes: the models hear 24 semitones higher
    assert all(c.best_shift == 0 and c.aligned.f1 == 1.0 for c in song.comparisons)


def test_a_standard_keyboard_is_checked_but_never_moved(tmp_path: Path) -> None:
    standard = video_reading(octave_guessed=False)

    [song] = run(tmp_path, reader=FakeVideoReader(standard), octave=FakeOctaveEstimator(heard(12)))

    assert song.octave == heard(12)  # measured, so the check itself can be judged
    assert song.reading is not None and song.reading.octave_shift == 0
    assert all(c.aligned.f1 == 1.0 for c in song.comparisons)


def test_an_octave_heard_with_little_margin_is_reported_but_not_applied(tmp_path: Path) -> None:
    [song] = run(
        tmp_path,
        reader=FakeVideoReader(lowered(12)),
        octave=FakeOctaveEstimator(heard(12, margin=0.05)),
    )

    assert song.octave == heard(12, margin=0.05)
    assert song.reading is not None and song.reading.octave_shift == 0


def test_an_octave_check_that_fails_leaves_the_reading_as_it_was(tmp_path: Path) -> None:
    [song] = run(
        tmp_path, reader=FakeVideoReader(lowered(12)), octave=FakeOctaveEstimator(fails=True)
    )

    assert song.error is None
    assert song.octave is None
    assert song.reading is not None and song.reading.octave_shift == 0
    assert song.comparisons


def test_without_sound_the_octave_is_not_checked(tmp_path: Path) -> None:
    estimator = FakeOctaveEstimator(heard(12))

    [song] = run(
        tmp_path,
        media=FakeSongMedia(audio=False),
        reader=FakeVideoReader(lowered(12)),
        octave=estimator,
    )

    assert song.octave is None
    assert estimator.asked == []
