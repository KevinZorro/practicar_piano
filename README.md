# Pianola (working name)

Free web app to practice piano with a digital keyboard over USB: paste the YouTube
link of a piano cover, and the app transcribes it and lets you practice with falling
notes, synchronized sheet music, wait mode and automatic rewind when you miss a note.

> **Status: Phase 0** — a feasibility benchmark that decides whether the project
> continues (gate 1). There is no UI yet. See [`docs/status.md`](docs/status.md).

## Why a Phase 0

The riskiest assumptions are technical: can the server fetch audio from YouTube, and
is the transcription good and fast enough on a small ARM64 VPS (Oracle Always Free,
2 OCPU / 12 GB)? Phase 0 is a CLI that answers both with ten real covers.

**Gate 1:** at least 8 of 10 songs recognizable by ear, and under 2 minutes of
processing per 3-minute song (real-time factor ≤ 0.67).

## Architecture (backend)

Ports and adapters, dependencies pointing inward:

```
cli ─▶ application (use cases, ports) ─▶ domain (pure rules)
              ▲
        infrastructure (yt-dlp, Basic Pitch, ByteDance model, synthesizer, meters)
```

Downloader, transcribers, synthesizer and the resource meter sit behind interfaces,
so each can be swapped without touching the domain. Decisions are recorded as ADRs in
[`docs/adr/`](docs/adr/) (D-01 … D-12).

## Quick start (Phase 0)

Requirements: Python 3.11+, [uv](https://docs.astral.sh/uv/), ffmpeg, Deno (for yt-dlp).

```bash
cd backend
uv sync --all-extras
uv run pytest -q -m "not network and not integration"   # unit tests, no network
uv run pianola phase0 run --links ../links.txt --out ../phase0-output
uv run pianola phase0 gate --out ../phase0-output
```

Running it on the VPS with ten covers: [`docs/phase-0/runbook.md`](docs/phase-0/runbook.md).

## Configuration

Environment variables (see `.env.example`): `PIANOLA_PROXY_URL` (optional proxy for
yt-dlp) and `PIANOLA_MAX_DURATION_SECONDS`. Secrets never go in the repository.

## Legal notes

The tool downloads audio only to transcribe it and deletes it right after. This
repository contains no audio or MIDI of copyrighted songs, and Phase 0 outputs are
git-ignored. Only paste links to audio you have the right to use. YouTube's terms of
service restrict downloading; see `docs/adr/0004-origen-del-audio.md` for the accepted
risk and mitigations.

## License

MIT. Third-party notices in [`NOTICE`](NOTICE).
