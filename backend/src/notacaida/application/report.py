"""Markdown report and verdicts template for the Phase 0 benchmark."""

from __future__ import annotations

import csv
import io
import statistics
from collections.abc import Sequence

from notacaida.domain.gate import (
    GateCriteria,
    GateResult,
    GateStatus,
    Verdicts,
    evaluate_gate,
    realtime_factor,
)
from notacaida.domain.models import SongResult

_VERDICT_HEADER = ["song", "label", "model", "recognizable"]
_TRUE = {"yes", "y", "si", "sí", "s", "1", "true"}
_FALSE = {"no", "n", "0", "false"}

_STATUS_TEXT = {
    GateStatus.PASS: "PASA: un mismo modelo cumple reconocimiento y tiempo.",
    GateStatus.PARTIAL: (
        "PARCIAL: hay suficientes canciones reconocibles, pero ningún modelo cumple "
        "reconocimiento y tiempo a la vez. Revisar con Kevin antes de seguir."
    ),
    GateStatus.FAIL: "NO PASA: ver el plan alternativo del estudio de viabilidad.",
    GateStatus.INCOMPLETE: "INCOMPLETA: faltan canciones o veredictos de oído.",
}


def render_verdicts_template(songs: Sequence[SongResult]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(_VERDICT_HEADER)
    for song in songs:
        for run in song.runs:
            if run.succeeded:
                writer.writerow([song.index, song.label, run.model_name, ""])
    return buffer.getvalue()


def parse_verdicts(text: str) -> Verdicts:
    verdicts: dict[tuple[int, str], bool] = {}
    for row in csv.DictReader(io.StringIO(text)):
        value = (row.get("recognizable") or "").strip().lower()
        if not value:
            continue
        if value not in _TRUE | _FALSE:
            raise ValueError(f"invalid verdict {value!r} for song {row.get('song')}")
        verdicts[(int(row["song"]), row["model"].strip())] = value in _TRUE
    return verdicts


def render_report(
    songs: Sequence[SongResult],
    environment: dict[str, str],
    *,
    verdicts: Verdicts | None = None,
    criteria: GateCriteria | None = None,
) -> str:
    criteria = criteria or GateCriteria()
    gate = evaluate_gate(songs, verdicts or {}, criteria)
    lines = ["# Informe de la Fase 0", ""]
    lines += ["## Entorno", ""]
    lines += [f"- {key}: {value}" for key, value in sorted(environment.items())]
    lines += ["", *_gate_section(gate, verdicts is not None), "", *_model_summary(songs, gate)]
    lines += ["", *_song_table(songs, criteria, verdicts or {})]
    lines += ["", *_notes(criteria)]
    return "\n".join(lines) + "\n"


def _gate_section(gate: GateResult, has_verdicts: bool) -> list[str]:
    c = gate.criteria
    lines = [
        "## Compuerta 1",
        "",
        f"Criterios: al menos {c.min_recognizable} de {c.total_songs} canciones reconocibles y "
        f"menos de {c.max_processing_seconds:.0f} s de proceso por canción de "
        f"{c.reference_duration_seconds:.0f} s (factor de tiempo real < "
        f"{c.max_realtime_factor:.2f}).",
        "",
        f"**Resultado: {_STATUS_TEXT[gate.status]}**",
        "",
        f"- Canciones: {gate.songs_total} · descargas correctas: {gate.downloads_ok}",
    ]
    if has_verdicts:
        lines.append(
            f"- Reconocibles con al menos un modelo: {gate.union_recognizable} · "
            f"veredictos pendientes: {gate.pending_verdicts}"
        )
    else:
        lines.append("- Veredictos de oído: pendientes (llena `verdicts.csv` y corre `gate`).")
    return lines


def _model_summary(songs: Sequence[SongResult], gate: GateResult) -> list[str]:
    lines = [
        "## Resumen por modelo",
        "",
        "| Modelo | Reconocibles | Fallos | Factor de tiempo real (mediana / peor) | "
        "Memoria pico MB (mediana / máx.) | Cumple tiempo |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for model in gate.models:
        runs = [(s, s.run_for(model.model_name)) for s in songs]
        factors = [
            f
            for s, r in runs
            if r is not None and (f := realtime_factor(r, s.duration_seconds)) is not None
        ]
        memory = [r.usage.peak_rss_mb for _, r in runs if r is not None and r.usage is not None]
        rtf = f"{statistics.median(factors):.2f} / {max(factors):.2f}" if factors else "—"
        mem = f"{statistics.median(memory):.0f} / {max(memory):.0f}" if memory else "—"
        lines.append(
            f"| {model.model_name} | {model.recognizable} | {model.failed_songs} | {rtf} | {mem} | "
            f"{'sí' if model.within_time else 'no'} |"
        )
    return lines


def _song_table(
    songs: Sequence[SongResult], criteria: GateCriteria, verdicts: Verdicts
) -> list[str]:
    lines = [
        "## Detalle por canción",
        "",
        "| # | Canción | Huella | Duración s | Descarga s | Modelo | Notas | Inferencia s | "
        "Total s | Memoria MB | Factor | Reconocible | Error |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for song in songs:
        head = f"| {song.index} | {song.label} | `{song.fingerprint}` | "
        head += f"{_num(song.duration_seconds)} | {_num(song.download_seconds)} | "
        if not song.runs:
            lines.append(head + f"— | — | — | — | — | — | — | {song.download_error or '—'} |")
            continue
        for run in song.runs:
            factor = realtime_factor(run, song.duration_seconds)
            verdict = verdicts.get((song.index, run.model_name))
            shown = "pendiente" if verdict is None else ("sí" if verdict else "no")
            lines.append(
                head
                + f"{run.model_name} | {_num(run.note_count)} | {_num(run.inference_seconds)} | "
                f"{_num(run.usage.wall_seconds if run.usage else None)} | "
                f"{_num(run.usage.peak_rss_mb if run.usage else None, 0)} | "
                f"{_num(factor, 2)} | {shown if run.succeeded else '—'} | {run.error or '—'} |"
            )
    return lines


def _notes(criteria: GateCriteria) -> list[str]:
    return [
        "## Cómo leer este informe",
        "",
        "- **Inferencia s**: tiempo del modelo ya cargado; es la cifra de la compuerta, porque "
        "el servidor cargará los modelos una sola vez al arrancar.",
        "- **Total s**: proceso completo incluyendo cargar el modelo (arranque en frío).",
        "- **Memoria**: pico de memoria residente del subproceso de cada modelo.",
        "- **Factor**: inferencia / duración; el presupuesto es "
        f"{criteria.max_realtime_factor:.2f}.",
        "- Los MIDI y WAV están en la carpeta de salida (no se versionan). Escucha cada WAV "
        "y anota `si` o `no` en `verdicts.csv`.",
    ]


def _num(value: float | int | None, digits: int = 1) -> str:
    if value is None:
        return "—"
    return f"{value:.{digits}f}" if isinstance(value, float) else str(value)
