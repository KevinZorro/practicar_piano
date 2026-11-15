from __future__ import annotations

import pytest

from pianola.application.report import parse_verdicts, render_report, render_verdicts_template
from pianola.application.results_store import dump_results, load_results
from pianola.domain.models import SongResult
from tests.unit.test_gate import run, song, ten_songs

ENV = {"platform": "linux-aarch64", "cpus": "2"}


def test_verdicts_template_lists_only_successful_runs_with_blank_verdicts() -> None:
    songs = [song(1, run("a", 10.0), run("b", 10.0, ok=False))]

    template = render_verdicts_template(songs)

    assert template.splitlines() == ["song,label,model,recognizable", "1,s1,a,"]


def test_parse_verdicts_accepts_spanish_and_english_and_skips_blanks() -> None:
    text = "song,label,model,recognizable\n1,x,a,si\n1,x,b,NO\n2,y,a,\n3,z,a,true\n"

    assert parse_verdicts(text) == {(1, "a"): True, (1, "b"): False, (3, "a"): True}


def test_parse_verdicts_rejects_unknown_values() -> None:
    with pytest.raises(ValueError, match="invalid verdict"):
        parse_verdicts("song,label,model,recognizable\n1,x,a,quizas\n")


def test_report_without_verdicts_says_gate_is_incomplete() -> None:
    report = render_report(ten_songs(), ENV)

    assert "# Informe de la Fase 0" in report
    assert "INCOMPLETA" in report
    assert "pendientes" in report
    assert "linux-aarch64" in report


def test_report_with_verdicts_shows_gate_result_and_per_model_summary() -> None:
    verdicts = {(i, "bytedance"): True for i in range(1, 11)}
    verdicts.update({(i, "basic-pitch"): i <= 5 for i in range(1, 11)})

    report = render_report(ten_songs(), ENV, verdicts=verdicts)

    assert "PASA" in report
    assert "| bytedance | 10 |" in report
    assert "| basic-pitch | 5 |" in report
    assert "0.33" in report  # 60 s / 180 s


def test_report_lists_download_errors_without_links() -> None:
    songs = [SongResult(index=1, label="blocked", fingerprint="abc", download_error="HTTP 403")]

    report = render_report(songs, ENV)

    assert "HTTP 403" in report
    assert "youtube" not in report.lower()


def test_results_round_trip_through_json() -> None:
    songs = [
        *ten_songs()[:2],
        SongResult(index=3, label="x", fingerprint="f", download_error="HTTP 403"),
    ]

    loaded, env = load_results(dump_results(songs, ENV))

    assert loaded == songs
    assert env == ENV


def test_load_results_rejects_unknown_schema() -> None:
    with pytest.raises(ValueError, match="schema"):
        load_results('{"schema": 99, "environment": {}, "songs": []}')
