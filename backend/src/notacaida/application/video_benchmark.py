"""ADR 0023 prototype: read the falling notes of each video and compare them with the audio.

For every song: get the picture and the sound, read the notes from the picture (measured in
its own process, like the models), transcribe the sound with each model, and compare every
reading with every transcription (and with the true notes of a synthetic video). A video
that cannot be read skips the models. Nothing of the song outlives the run but the MIDI, a
WAV of each to listen to and the check images.

With ``reuse_from`` a model is not run again for a song whose MIDI an earlier run left, in
this run's output or in the given folders (the Phase 0 output names the songs the same way):
a rerun that only changes the reader takes minutes instead of the models' half hour.
"""

from __future__ import annotations

import logging
import shutil
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from functools import partial
from pathlib import Path

from notacaida.application.links import SongEntry
from notacaida.application.ports import (
    MidiNoteReader,
    MidiNoteWriter,
    OctaveEstimator,
    ResourceMeter,
    RollPlotter,
    SongMedia,
    SongMediaSource,
    Synthesizer,
    Transcriber,
    VideoNoteReader,
)
from notacaida.domain.agreement import (
    NOTE_50MS,
    ONSET_50MS,
    ONSET_100MS,
    Agreement,
    agreement,
    best_pitch_shift,
    estimate_delay,
)
from notacaida.domain.errors import NotacaidaError
from notacaida.domain.models import AudioFile, ResourceUsage
from notacaida.domain.notes import NoteEvent
from notacaida.domain.quantize import assign_hand
from notacaida.domain.video_reading import NoteReading, OctaveEstimate, VideoReading

logger = logging.getLogger(__name__)

TRUTH = "verdad"
VIDEO_PREFIX = "video:"
#: Suffix of a reading that was made but not trusted, measured so the rule can be checked.
DISCARDED = " (descartada)"
#: The octave heard in the song replaces the guessed one only when it beats the runner-up by
#: this much (log10 units; synthetic audio gives ~2, real audio is yet to be measured).
OCTAVE_MIN_MARGIN = 0.3
_SHIFTS = range(-24, 25)
_ROLL_SECONDS = 30.0


@dataclass(frozen=True, slots=True)
class Comparison:
    """How an estimate agrees with a reference, as read and once their delay is removed."""

    reference: str
    estimate: str
    onset: Agreement  # onsets within 50 ms, as read
    aligned: Agreement  # same, after removing the constant delay
    aligned_100ms: Agreement
    with_offsets: Agreement  # aligned, and the ends must agree too
    delay_s: float | None  # measured at ``best_shift``
    #: Transposition (semitones) that agrees best; not 0 means the keys were misnamed.
    best_shift: int
    shifted: Agreement  # aligned and transposed by ``best_shift``


@dataclass(frozen=True, slots=True)
class ModelResult:
    name: str
    note_count: int | None = None
    usage: ResourceUsage | None = None
    error: str | None = None
    #: The MIDI of an earlier run was read instead of transcribing again (no usage then).
    reused: bool = False


@dataclass(frozen=True, slots=True)
class VideoSongReport:
    index: int
    label: str
    fingerprint: str
    error: str | None = None
    duration_s: float | None = None
    fetch_s: float | None = None
    video_mb: float | None = None
    reading: VideoReading | None = None
    reading_usage: ResourceUsage | None = None
    models: tuple[ModelResult, ...] = ()
    comparisons: tuple[Comparison, ...] = ()
    #: Share of the read notes whose bar colour gives the hand the pitch split gives (D-08).
    hand_split_agreement: float | None = None
    #: Which octave the song sounds in, according to its audio (None: not checked).
    octave: OctaveEstimate | None = None


@dataclass(frozen=True, slots=True)
class BenchmarkTools:
    midi_reader: MidiNoteReader
    midi_writer: MidiNoteWriter
    meter: ResourceMeter
    synthesizer: Synthesizer | None = None
    plotter: RollPlotter | None = None
    octave: OctaveEstimator | None = None


class CompareVideoReading:
    def __init__(
        self,
        media: SongMediaSource,
        reader: VideoNoteReader,
        transcribers: Sequence[Transcriber],
        tools: BenchmarkTools,
        *,
        reuse_from: Sequence[Path] | None = None,
        clock: Callable[[], float] = time.perf_counter,
    ) -> None:
        """``reuse_from``: None transcribes every song; a sequence (even empty) first looks
        for a MIDI of an earlier run in this run's output, then in those folders."""
        self._media = media
        self._reader = reader
        self._transcribers = tuple(transcribers)
        self._tools = tools
        self._reuse_from = None if reuse_from is None else tuple(reuse_from)
        self._clock = clock

    def run(
        self, entries: Sequence[SongEntry], out_dir: Path, work_dir: Path
    ) -> list[VideoSongReport]:
        return [self._run_song(entry, out_dir, work_dir) for entry in entries]

    def _run_song(self, entry: SongEntry, out_dir: Path, work_dir: Path) -> VideoSongReport:
        fingerprint = entry.source.fingerprint
        song_out = out_dir / f"{entry.index:02d}-{fingerprint}"
        song_work = work_dir / f"{entry.index:02d}-{fingerprint}"
        song_out.mkdir(parents=True, exist_ok=True)
        song_work.mkdir(parents=True, exist_ok=True)
        base = VideoSongReport(index=entry.index, label=entry.label, fingerprint=fingerprint)
        logger.info("[%02d] %s (%s): start", entry.index, entry.label, fingerprint)
        try:
            started = self._clock()
            try:
                media = self._media.fetch(entry.source, song_work)
            except NotacaidaError as exc:
                logger.warning("song %s: could not get the video: %s", fingerprint, exc)
                return replace(base, error=str(exc))
            return self._measure(base, media, self._clock() - started, song_out)
        finally:
            shutil.rmtree(song_work, ignore_errors=True)  # the media never outlive the song

    def _measure(
        self, base: VideoSongReport, media: SongMedia, fetch_s: float, song_out: Path
    ) -> VideoSongReport:
        tools = self._tools
        try:
            measured = tools.meter.measure(partial(self._reader.read, media.video, song_out))
        except NotacaidaError as exc:
            logger.warning("song %s: video reading failed: %s", base.fingerprint, exc)
            return replace(
                base,
                error=f"lectura del video: {exc}",
                duration_s=media.video.duration_seconds,
                fetch_s=fetch_s,
            )
        reading = measured.value
        read = replace(
            base,
            duration_s=media.video.duration_seconds,
            fetch_s=fetch_s,
            video_mb=media.video.megabytes,
            reading=reading,
            reading_usage=measured.usage,
        )
        preferred = reading.preferred_reading
        if preferred is None:
            return read  # nothing to compare with: the models would only cost time
        octave = self._hear_octave(preferred.notes, media.audio, base.fingerprint)
        if octave is not None and reading.octave_guessed and _worth_applying(octave):
            reading = _shifted(reading, octave.shift)
            preferred = reading.preferred_reading
            assert preferred is not None  # noqa: S101 - it was there before the shift
            read = replace(read, reading=reading)
        references: dict[str, tuple[NoteEvent, ...]] = {}
        if media.truth is not None:
            references[TRUTH] = media.truth
        models = []
        for transcriber in self._transcribers if media.audio else ():
            result, notes = self._transcribe(transcriber, media, song_out, base.fingerprint)
            models.append(result)
            if notes is not None:
                references[transcriber.name] = notes
        tools.midi_writer.write(preferred.notes, song_out / "video.mid")
        heard = [m.name for m in models if m.error is None and not _has_wav(m, song_out)]
        self._synthesize(song_out, ["video", *heard])
        if tools.plotter is not None and references:
            name = next(iter(references))
            tools.plotter.plot(
                song_out / "roll.png", references[name], preferred.notes, _ROLL_SECONDS
            )
        return replace(
            read,
            models=tuple(models),
            comparisons=tuple(_comparisons(reading, references)),
            hand_split_agreement=_hand_split(reading),
            octave=octave,
        )

    def _hear_octave(
        self, notes: Sequence[NoteEvent], audio: AudioFile | None, fingerprint: str
    ) -> OctaveEstimate | None:
        estimator = self._tools.octave
        if estimator is None or audio is None:
            return None
        try:
            return estimator.estimate(notes, audio)
        except NotacaidaError as exc:  # the reading is still reported, as it was read
            logger.warning("song %s: octave check failed: %s", fingerprint, exc)
            return None

    def _synthesize(self, song_out: Path, names: Sequence[str]) -> None:
        """A WAV of each MIDI with the same synthesizer, to compare them by ear."""
        synthesizer = self._tools.synthesizer
        if synthesizer is None:
            return
        for name in names:
            try:
                synthesizer.render(song_out / f"{name}.mid", song_out / f"{name}.wav")
            except NotacaidaError as exc:  # only the WAV is lost
                logger.warning("could not synthesize %s: %s", name, exc)

    def _transcribe(
        self, transcriber: Transcriber, media: SongMedia, song_out: Path, fingerprint: str
    ) -> tuple[ModelResult, tuple[NoteEvent, ...] | None]:
        assert media.audio is not None  # noqa: S101 - checked by the caller
        midi_path = song_out / f"{transcriber.name}.mid"
        earlier = self._earlier_midi(transcriber.name, song_out, fingerprint)
        if earlier is not None:
            try:
                notes = self._tools.midi_reader.read(earlier)
                if earlier != midi_path:  # keep it beside the reading, for its WAV and roll
                    shutil.copyfile(earlier, midi_path)
            except (NotacaidaError, OSError) as exc:  # unusable: transcribe again
                logger.warning("cannot reuse %s: %s", transcriber.name, exc)
            else:
                logger.info("reusing the %s transcription of an earlier run", transcriber.name)
                return ModelResult(transcriber.name, len(notes), reused=True), notes
        try:
            measured = self._tools.meter.measure(
                partial(transcriber.transcribe, media.audio, midi_path)
            )
            notes = self._tools.midi_reader.read(midi_path)
        except NotacaidaError as exc:
            logger.warning("model %s failed: %s", transcriber.name, exc)
            return ModelResult(transcriber.name, error=str(exc)), None
        return ModelResult(transcriber.name, len(notes), measured.usage), notes

    def _earlier_midi(self, name: str, song_out: Path, fingerprint: str) -> Path | None:
        """The MIDI of model ``name`` an earlier run left for this song, if reusing."""
        if self._reuse_from is None:
            return None
        own = song_out / f"{name}.mid"
        if own.is_file():
            return own
        for folder in self._reuse_from:  # any index: the song list may have been reordered
            found = sorted(folder.glob(f"*-{fingerprint}/{name}.mid"))
            if found:
                return found[0]
        return None


def _has_wav(model: ModelResult, song_out: Path) -> bool:
    """A reused transcription whose WAV an earlier run already wrote here."""
    return model.reused and (song_out / f"{model.name}.wav").is_file()


def compare(
    reference_name: str,
    reference: Sequence[NoteEvent],
    estimate_name: str,
    estimate: Sequence[NoteEvent],
) -> Comparison:
    shift, _ = best_pitch_shift(reference, estimate, _SHIFTS, ONSET_100MS)
    # at the best transposition: the notes of a misnamed keyboard pair with nothing as read
    delay = estimate_delay(reference, estimate, pitch_shift=shift)
    aligned = partial(agreement, reference, estimate, time_shift_s=-(delay or 0.0))
    return Comparison(
        reference=reference_name,
        estimate=estimate_name,
        onset=agreement(reference, estimate, ONSET_50MS),
        aligned=aligned(ONSET_50MS),
        aligned_100ms=aligned(ONSET_100MS),
        with_offsets=aligned(NOTE_50MS),
        delay_s=delay,
        best_shift=shift,
        shifted=aligned(ONSET_50MS, pitch_shift=shift),
    )


def _worth_applying(estimate: OctaveEstimate) -> bool:
    return estimate.shift != 0 and estimate.margin >= OCTAVE_MIN_MARGIN


def _shifted(reading: VideoReading, semitones: int) -> VideoReading:
    """The same reading with every pitch moved by ``semitones``."""

    def move(found: NoteReading) -> NoteReading:
        notes = tuple(replace(n, pitch=n.pitch + semitones) for n in found.notes)
        return replace(found, notes=notes)

    return replace(
        reading,
        readings=tuple(move(r) for r in reading.readings),
        discarded=tuple(move(r) for r in reading.discarded),
        octave_shift=semitones,
    )


def _comparisons(
    reading: VideoReading, references: dict[str, tuple[NoteEvent, ...]]
) -> list[Comparison]:
    result = []
    shown = [(r, VIDEO_PREFIX + r.method) for r in reading.readings] + [
        (r, VIDEO_PREFIX + r.method + DISCARDED) for r in reading.discarded
    ]
    for note_reading, estimate in shown:
        for name, notes in references.items():
            result.append(compare(name, notes, estimate, note_reading.notes))
    truth = references.get(TRUTH)
    if truth is not None:
        result.extend(
            compare(TRUTH, truth, name, notes)
            for name, notes in references.items()
            if name != TRUTH
        )
    return result


def _hand_split(reading: VideoReading) -> float | None:
    preferred = reading.preferred_reading
    if preferred is None or not preferred.hands:
        return None
    pairs = [(n, h) for n, h in zip(preferred.notes, preferred.hands, strict=True) if h]
    if not pairs:
        return None
    return sum(assign_hand(n.pitch) is h for n, h in pairs) / len(pairs)
