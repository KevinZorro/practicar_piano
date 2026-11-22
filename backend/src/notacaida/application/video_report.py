"""Markdown report and JSON summary of the video reading benchmark (ADR 0023)."""

from __future__ import annotations

import json
import statistics
from collections.abc import Sequence

from notacaida.application.video_benchmark import (
    TRUTH,
    VIDEO_PREFIX,
    Comparison,
    VideoSongReport,
)
from notacaida.domain.agreement import Agreement

_PREFERRED_AUDIO = ("bytedance", "basic-pitch")
_METHOD_TEXT = {
    "bars": "barras",
    "keys": "teclas iluminadas",
    "fused": "teclas + barras",
}


def render_video_report(songs: Sequence[VideoSongReport], environment: dict[str, str]) -> str:
    lines = [
        "# Lectura de las notas del video (ADR 0023): informe",
        "",
        "Entorno: " + ", ".join(f"{k} {v}" for k, v in environment.items()),
        "",
        "## Resumen",
        "",
        _summary_header(songs),
        *(_summary_row(song) for song in songs),
        "",
        *_totals(songs),
        "",
        "## Cómo leerlo",
        "",
        "- **F1**: de 0 a 1, cuánto coinciden dos listas de notas (misma tecla e inicio a menos "
        "de 50 ms). Contra el audio no es una nota de acierto: ByteDance también se equivoca; "
        "un F1 alto dice que ambos leen la misma canción.",
        "- **Desfase**: cuánto antes (-) o después (+) que el audio empiezan las notas leídas; "
        "las columnas *alineado* lo descuentan.",
        "- **Transposición** distinta de 0: el teclado del video se nombró corrido (por ejemplo, "
        "+12 es una octava).",
        "- `keyboard.png`: lo detectado sobre el fondo del video (línea roja: donde caen las "
        "barras; marca verde: Do central; azul: los demás Do). `roll.png`: rojo es la "
        "referencia, verde la lectura del video y amarillo donde coinciden (primeros 30 s).",
        "- `video.wav`: la lectura del video sintetizada; `bytedance.wav` y `basic-pitch.wav`: lo "
        "que transcribió cada modelo, con el mismo sintetizador, para compararlos de oído.",
        "",
        "## Detalle por canción",
    ]
    for song in songs:
        lines += ["", *_details(song)]
    return "\n".join(lines) + "\n"


def dump_video_results(songs: Sequence[VideoSongReport], environment: dict[str, str]) -> str:
    """Summary numbers only (the notes themselves are in the MIDI files)."""
    payload = {"environment": environment, "songs": [_song_json(song) for song in songs]}
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def _audio_names(songs: Sequence[VideoSongReport]) -> list[str]:
    names = {c.reference for s in songs for c in s.comparisons if c.reference != TRUTH}
    ordered = [n for n in _PREFERRED_AUDIO if n in names] + sorted(names - set(_PREFERRED_AUDIO))
    has_truth = any(c.reference == TRUTH for s in songs for c in s.comparisons)
    return ([TRUTH] if has_truth else []) + ordered


def _summary_header(songs: Sequence[VideoSongReport]) -> str:
    references = _audio_names(songs)
    columns = ["#", "Canción", "Teclado", "Lectura", "Notas"]
    columns += [f"F1 vs {name} (alineado)" for name in references]
    columns += ["Desfase", "Lectura del video", "Memoria", "Video"]
    header = "| " + " | ".join(columns) + " |"
    return header + "\n|" + "---|" * len(columns)


def _summary_row(song: VideoSongReport) -> str:
    reading = song.reading
    references = _audio_names([song]) if song.comparisons else []
    if song.error or reading is None:
        return f"| {song.index} | {song.label} | — | error: {song.error} |"
    if not reading.readable:
        return f"| {song.index} | {song.label} | {reading.keyboard or '—'} | {reading.failure} |"
    preferred = reading.preferred_reading
    assert preferred is not None  # noqa: S101 - readable
    method = VIDEO_PREFIX + preferred.method
    f1s, delay = [], None
    for name in references:
        found = _find(song.comparisons, name, method)
        f1s.append(_f1(found.aligned) if found else "—")
        if found and delay is None and found.delay_s is not None and name != TRUTH:
            delay = found.delay_s
    usage = song.reading_usage
    return (
        "| "
        + " | ".join(
            [
                str(song.index),
                song.label,
                reading.keyboard or "—",
                _METHOD_TEXT.get(preferred.method, preferred.method),
                str(len(preferred.notes)),
                *f1s,
                _ms(delay),
                f"{usage.wall_seconds:.1f} s" if usage else "—",
                f"{usage.peak_rss_mb:.0f} MB" if usage else "—",
                f"{song.video_mb:.1f} MB" if song.video_mb else "—",
            ]
        )
        + " |"
    )


def _totals(songs: Sequence[VideoSongReport]) -> list[str]:
    readable = [s for s in songs if s.reading and s.reading.readable]
    lines = [f"- Videos con notas que caen leídos: **{len(readable)} de {len(songs)}**."]
    for name in _audio_names(songs):
        f1s = []
        for song in readable:
            preferred = song.reading.preferred_reading if song.reading else None
            found = preferred and _find(song.comparisons, name, VIDEO_PREFIX + preferred.method)
            if found:
                f1s.append(found.aligned.f1)
        if f1s:
            median = statistics.median(f1s)
            lines.append(
                f"- F1 alineado de la lectura contra {name}: mediana **{median:.3f}**, "
                f"peor {min(f1s):.3f} ({len(f1s)} canciones)."
            )
    timings = {"leer el video": [s.reading_usage.wall_seconds for s in readable if s.reading_usage]}
    for song in songs:
        for model in song.models:
            if model.usage:
                timings.setdefault(model.name, []).append(model.usage.wall_seconds)
    for name, seconds in timings.items():
        if seconds:
            median = statistics.median(seconds)
            lines.append(
                f"- Tiempo, {name}: {sum(seconds):.0f} s en total, mediana {median:.1f} s."
            )
    return lines


def _details(song: VideoSongReport) -> list[str]:
    lines = [f"### {song.index:02d} · {song.label} (`{song.fingerprint}`)", ""]
    if song.error:
        return [*lines, f"- Error: {song.error}"]
    reading = song.reading
    if reading is None:
        return lines
    if song.duration_s:
        lines.append(
            f"- Duración {song.duration_s:.0f} s; obtener video y audio: {song.fetch_s or 0:.0f} s."
        )
    if reading.failure:
        lines.append(f"- No se leyó: {reading.failure} (teclado: {reading.keyboard or 'no'}).")
    else:
        lines.append(
            f"- Teclado {reading.keyboard}; {reading.fps:.0f} fotogramas por segundo, "
            f"{reading.frames_with_keyboard} de {reading.frames} con el teclado a la vista; "
            f"las barras caen a {reading.fall_speed_px_s:.0f} px/s; teclas iluminadas: "
            f"{'sí' if reading.lit_keys else 'no'}."
        )
    if song.hand_split_agreement is not None:
        lines.append(
            f"- Manos por color: {song.hand_split_agreement:.0%} de las notas coinciden con la "
            "división actual en Do central."
        )
    for model in song.models:
        if model.error:
            lines.append(f"- {model.name}: error: {model.error}")
        elif model.usage:
            lines.append(
                f"- {model.name}: {model.note_count} notas en {model.usage.wall_seconds:.0f} s, "
                f"{model.usage.peak_rss_mb:.0f} MB."
            )
    if song.comparisons:
        lines += [
            "",
            "| Referencia | Lectura | Notas ref / lect. | Precisión | Recall | F1 | F1 alineado "
            "| F1 ±100 ms | F1 con finales | Desfase | Transposición |",
            "|---|---|---|---|---|---|---|---|---|---|---|",
        ]
        lines += [_comparison_row(c) for c in song.comparisons]
    return lines


def _comparison_row(c: Comparison) -> str:
    shift = "0" if c.best_shift == 0 else f"{c.best_shift:+d} (F1 {_f1(c.shifted)})"
    return (
        f"| {c.reference} | {c.estimate} | {c.aligned.reference_count} / "
        f"{c.aligned.estimate_count} | {c.aligned.precision:.3f} | {c.aligned.recall:.3f} | "
        f"{_f1(c.onset)} | {_f1(c.aligned)} | {_f1(c.aligned_100ms)} | {_f1(c.with_offsets)} | "
        f"{_ms(c.delay_s)} | {shift} |"
    )


def _find(comparisons: Sequence[Comparison], reference: str, estimate: str) -> Comparison | None:
    return next(
        (c for c in comparisons if c.reference == reference and c.estimate == estimate), None
    )


def _f1(a: Agreement) -> str:
    return f"{a.f1:.3f}"


def _ms(seconds: float | None) -> str:
    return "—" if seconds is None else f"{seconds * 1000:+.0f} ms"


def _song_json(song: VideoSongReport) -> dict[str, object]:
    reading = song.reading
    return {
        "index": song.index,
        "label": song.label,
        "fingerprint": song.fingerprint,
        "error": song.error,
        "duration_s": song.duration_s,
        "fetch_s": song.fetch_s,
        "video_mb": song.video_mb,
        "reading": None
        if reading is None
        else {
            "failure": reading.failure,
            "keyboard": reading.keyboard,
            "fps": reading.fps,
            "frames": reading.frames,
            "frames_with_keyboard": reading.frames_with_keyboard,
            "fall_speed_px_s": reading.fall_speed_px_s,
            "lit_keys": reading.lit_keys,
            "preferred": reading.preferred,
            "notes": {r.method: len(r.notes) for r in reading.readings},
        },
        "reading_usage": None
        if song.reading_usage is None
        else {"wall_s": song.reading_usage.wall_seconds, "peak_mb": song.reading_usage.peak_rss_mb},
        "models": [
            {
                "name": m.name,
                "notes": m.note_count,
                "error": m.error,
                "wall_s": m.usage.wall_seconds if m.usage else None,
                "peak_mb": m.usage.peak_rss_mb if m.usage else None,
            }
            for m in song.models
        ],
        "hand_split_agreement": song.hand_split_agreement,
        "comparisons": [_comparison_json(c) for c in song.comparisons],
    }


def _comparison_json(c: Comparison) -> dict[str, object]:
    def numbers(a: Agreement) -> dict[str, float | int | None]:
        return {
            "matched": a.matched,
            "reference": a.reference_count,
            "estimate": a.estimate_count,
            "precision": round(a.precision, 4),
            "recall": round(a.recall, 4),
            "f1": round(a.f1, 4),
        }

    return {
        "reference": c.reference,
        "estimate": c.estimate,
        "delay_s": c.delay_s,
        "best_shift": c.best_shift,
        "onset_50ms": numbers(c.onset),
        "aligned_50ms": numbers(c.aligned),
        "aligned_100ms": numbers(c.aligned_100ms),
        "aligned_with_offsets": numbers(c.with_offsets),
        "shifted_50ms": numbers(c.shifted),
    }
