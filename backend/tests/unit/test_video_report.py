from __future__ import annotations

import json

from notacaida.application.video_benchmark import (
    TRUTH,
    ModelResult,
    VideoSongReport,
    compare,
)
from notacaida.application.video_report import dump_video_results, render_video_report
from notacaida.domain.models import ResourceUsage
from notacaida.domain.notes import NoteEvent
from notacaida.domain.video_reading import NoteReading, ReadingMethod, VideoReading

SCALE = tuple(NoteEvent(60 + i, 1.0 + 0.5 * i, 1.4 + 0.5 * i, 80) for i in range(8))
HALF = SCALE[::2]
ENVIRONMENT = {"plataforma": "Linux aarch64", "cpus": "2"}


def songs() -> list[VideoSongReport]:
    fused = NoteReading(ReadingMethod.FUSED, SCALE)
    bars = NoteReading(ReadingMethod.BARS, HALF)
    read = VideoReading(
        None, "88 teclas, A0-C8", 30.0, 900, 880, 240.0, True, (bars, fused), ReadingMethod.FUSED
    )
    late = tuple(NoteEvent(n.pitch, n.start_s - 0.03, n.end_s, 80) for n in SCALE)
    return [
        VideoSongReport(
            1,
            "Leída",
            "aaaaaaaaaa",
            duration_s=30.0,
            fetch_s=4.0,
            video_mb=2.5,
            reading=read,
            reading_usage=ResourceUsage(3.2, 150.0),
            models=(ModelResult("bytedance", 8, ResourceUsage(360.0, 2900.0)),),
            comparisons=(
                compare(TRUTH, SCALE, "video:fused", SCALE),
                compare(TRUTH, SCALE, "video:bars", HALF),
                compare("bytedance", late, "video:fused", SCALE),
                compare("bytedance", late, "video:bars", HALF),
                compare(TRUTH, SCALE, "bytedance", late),
            ),
            hand_split_agreement=0.9,
        ),
        VideoSongReport(
            2,
            "Piano filmado",
            "bbbbbbbbbb",
            duration_s=60.0,
            reading=VideoReading(failure="no se encontró un teclado dibujado", fps=30.0),
        ),
        VideoSongReport(3, "Bloqueada", "cccccccccc", error="blocked by fake"),
    ]


def test_the_summary_has_one_column_per_reference_truth_first() -> None:
    report = render_video_report(songs(), ENVIRONMENT)

    assert "| F1 vs verdad (alineado) | F1 vs bytedance (alineado) |" in report
    assert (
        "| 1 | Leída | 88 teclas, A0-C8 | teclas + barras | 8 | 1.000 | 1.000 | +30 ms |" in report
    )
    assert "| 2 | Piano filmado | — | no se encontró un teclado dibujado |" in report
    assert "| 3 | Bloqueada | — | error: blocked by fake |" in report
    assert "Entorno: plataforma Linux aarch64, cpus 2" in report


def test_the_totals_count_the_videos_read_and_the_median_agreement() -> None:
    report = render_video_report(songs(), ENVIRONMENT)

    assert "Videos con notas que caen leídos: **1 de 3**" in report
    assert "contra verdad: mediana **1.000**" in report
    assert "Tiempo, leer el video: 3 s en total" in report
    assert "Tiempo, bytedance: 360 s en total" in report


def test_the_details_show_every_comparison_and_the_hands() -> None:
    report = render_video_report(songs(), ENVIRONMENT)

    assert "### 01 · Leída (`aaaaaaaaaa`)" in report
    assert "880 de 900 con el teclado a la vista" in report
    assert "Manos por color: 90% de las notas" in report
    assert "| verdad | video:bars | 8 / 4 | 1.000 | 0.500 |" in report
    assert "- No se leyó: no se encontró un teclado dibujado (teclado: no)." in report
    assert "- Error: blocked by fake" in report


def test_the_json_summary_keeps_the_numbers_but_not_the_notes() -> None:
    payload = json.loads(dump_video_results(songs(), ENVIRONMENT))

    first = payload["songs"][0]
    assert payload["environment"] == ENVIRONMENT
    assert first["reading"]["notes"] == {"bars": 4, "fused": 8}
    assert first["reading"]["preferred"] == "fused"
    assert first["comparisons"][0]["aligned_50ms"]["f1"] == 1.0
    assert first["comparisons"][2]["delay_s"] < 0.031
    assert payload["songs"][1]["reading"]["failure"] == "no se encontró un teclado dibujado"
    assert payload["songs"][2]["error"] == "blocked by fake"
    assert "pitch" not in json.dumps(payload)
