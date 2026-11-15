from __future__ import annotations

from pathlib import Path

from pianola.domain.gate import GateCriteria, GateStatus, evaluate_gate
from pianola.domain.models import ModelRun, ResourceUsage, SongResult

FAST = 60.0  # 180 s song in 60 s -> real-time factor 0.33
SLOW = 130.0  # 180 s song in 130 s -> 0.72, over budget


def run(model: str, seconds: float, *, ok: bool = True) -> ModelRun:
    if not ok:
        return ModelRun(model_name=model, error="boom")
    return ModelRun(
        model_name=model,
        midi_path=Path(f"{model}.mid"),
        wav_path=Path(f"{model}.wav"),
        note_count=10,
        inference_seconds=seconds,
        usage=ResourceUsage(seconds + 5, 800.0),
    )


def song(index: int, *runs: ModelRun, duration: float = 180.0) -> SongResult:
    return SongResult(
        index=index,
        label=f"s{index}",
        fingerprint=f"f{index:09d}",
        duration_seconds=duration,
        download_seconds=5.0,
        runs=runs,
    )


def ten_songs(bp: float = FAST, bd: float = FAST) -> list[SongResult]:
    return [song(i, run("basic-pitch", bp), run("bytedance", bd)) for i in range(1, 11)]


def verdicts(recognized_by: dict[str, int]) -> dict[tuple[int, str], bool]:
    return {(i, model): i <= count for model, count in recognized_by.items() for i in range(1, 11)}


def test_passes_when_one_model_is_recognizable_and_fast_enough() -> None:
    result = evaluate_gate(ten_songs(), verdicts({"basic-pitch": 5, "bytedance": 8}))

    assert result.status is GateStatus.PASS
    by_name = {m.model_name: m for m in result.models}
    assert by_name["bytedance"].recognizable == 8
    assert by_name["bytedance"].within_time


def test_fails_the_speed_criterion_even_if_recognition_is_perfect() -> None:
    result = evaluate_gate(ten_songs(bd=SLOW), verdicts({"basic-pitch": 3, "bytedance": 10}))

    assert result.status is GateStatus.PARTIAL  # recognizable, but no model is fast enough
    assert not {m.model_name: m for m in result.models}["bytedance"].within_time


def test_time_budget_is_normalized_by_song_duration() -> None:
    songs = [song(i, run("m", 100.0), duration=300.0) for i in range(1, 11)]  # factor 0.33

    result = evaluate_gate(songs, {(i, "m"): True for i in range(1, 11)})

    assert result.status is GateStatus.PASS


def test_exactly_two_minutes_for_three_minutes_is_not_under_budget() -> None:
    songs = [song(i, run("m", 120.0)) for i in range(1, 11)]

    result = evaluate_gate(songs, {(i, "m"): True for i in range(1, 11)})

    assert result.status is GateStatus.PARTIAL
    assert not result.models[0].within_time


def test_partial_when_only_the_union_of_models_reaches_eight() -> None:
    v = {(i, "basic-pitch"): i <= 4 for i in range(1, 11)}
    v.update({(i, "bytedance"): 5 <= i <= 9 for i in range(1, 11)})

    result = evaluate_gate(ten_songs(), v)

    assert result.union_recognizable == 9
    assert result.status is GateStatus.PARTIAL


def test_fails_when_too_few_songs_are_recognizable() -> None:
    result = evaluate_gate(ten_songs(), verdicts({"basic-pitch": 3, "bytedance": 4}))

    assert result.status is GateStatus.FAIL


def test_incomplete_with_missing_verdicts() -> None:
    partial = verdicts({"basic-pitch": 10, "bytedance": 10})
    del partial[(3, "bytedance")]

    result = evaluate_gate(ten_songs(), partial)

    assert result.status is GateStatus.INCOMPLETE
    assert result.pending_verdicts == 1


def test_incomplete_with_fewer_songs_than_required() -> None:
    songs = ten_songs()[:6]

    result = evaluate_gate(songs, verdicts({"basic-pitch": 6, "bytedance": 6}))

    assert result.status is GateStatus.INCOMPLETE


def test_failed_model_run_counts_as_unrecognized_and_not_within_time() -> None:
    songs = [song(i, run("m", FAST, ok=i != 2)) for i in range(1, 11)]
    v = {(i, "m"): True for i in range(1, 11) if i != 2}

    result = evaluate_gate(songs, v)

    model = result.models[0]
    assert model.recognizable == 9
    assert model.failed_songs == 1
    assert not model.within_time
    assert result.status is GateStatus.PARTIAL


def test_failed_downloads_reduce_recognition_but_not_the_speed_check() -> None:
    songs = [
        SongResult(index=i, label="x", fingerprint="f", download_error="blocked")
        if i > 8
        else song(i, run("m", FAST))
        for i in range(1, 11)
    ]
    v = {(i, "m"): True for i in range(1, 9)}

    result = evaluate_gate(songs, v)

    assert result.downloads_ok == 8
    assert result.status is GateStatus.PASS


def test_custom_criteria_change_the_budget() -> None:
    strict = GateCriteria(max_processing_seconds=30.0)
    result = evaluate_gate(ten_songs(), verdicts({"basic-pitch": 10, "bytedance": 10}), strict)

    assert result.status is GateStatus.PARTIAL
