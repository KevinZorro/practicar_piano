# Pianola (working name)

Web app to practice piano from a YouTube cover link (falling notes, sheet music, wait mode). Public portfolio repo (Full Stack + ML). Phase 0 is closed; **Phase 1** (MVP) in progress, see `docs/status.md` and `docs/phase-1/plan.md`.

## Stack
- Backend: Python 3.11+, uv, yt-dlp (+ Deno), Basic Pitch (ONNX default), ByteDance piano model, music21 (Phase 1), FastAPI (Phase 1)
- Frontend (Phase 1): React + TypeScript + Vite, Canvas 2D, Web MIDI, YouTube IFrame API
- Infra: Docker (linux/arm64), Docker Compose, Nginx + HTTPS on Oracle Ampere A1 (2 OCPU, 12 GB)

## Commands (from `backend/`)
- Install: `uv sync --python 3.11 --extra synth --extra basic-pitch --extra bytedance`
- Offline tests (default, excludes `network`): `uv run pytest -q -x` · unit only: `-m "not integration"`
- Integration (real Basic Pitch, needs extras): `uv run pytest -q -m integration`
- Network (real YouTube, set `PIANOLA_TEST_VIDEO_URL`): `uv run pytest -q -m network`
- Lint/format/types: `uv run ruff check . && uv run ruff format --check . && uv run mypy src tests`
- API contract: `uv run python -m pianola.api.openapi` rewrites `docs/api/openapi.json` (a test fails if stale)
- Frontend (from `frontend/`): `npm ci`, `npm run typecheck && npm run lint && npm run format:check && npm test`; e2e: `npm run e2e` (`PW_CHROMIUM_PATH` reuses a local Chromium)
- Phase 0: `uv run pianola phase0 run --links links.txt --out phase0-output` then `... phase0 gate`

## Structure
- `backend/src/pianola/{domain,application,infrastructure,api,cli}`: hexagonal; domain imports nothing external
- `backend/tests/{unit,integration}`; `frontend/src/{core,adapters,render,ui}` (core is pure TS); `infra/` compose/proxy notes
- `docs/adr/` one ADR per decision D-01..D-12; `docs/status.md` phase state; `docs/phase-0/` runbook

## Architecture
Ports and adapters: downloader, transcribers, synthesizer, resource meter are ports in `application/ports.py`; adapters in `infrastructure/`. Detail in `docs/architecture.md`. Source of truth: the feasibility study and decision log (D-01..D-12) summarized in `docs/adr/`. If something contradicts a decision: tell Kevin and write an ADR before changing it.

## Conventions and gotchas
- Code, identifiers, commits, PRs in English; `docs/` and ADRs in Spanish.
- Never commit audio/MIDI/models/links (`.gitignore` blocks them). Never log YouTube URLs.
- Only permissive licenses (MIT/BSD/Apache/Unlicense). No GPL (PianoBooster/Neothesia are off-limits).
- Basic Pitch 0.4.0 forces tensorflow on Linux; `override-dependencies` drops it and the ONNX runtime is used. ByteDance checkpoint is fetched/verified by `backend/scripts/fetch_bytedance_checkpoint.sh` (ADR 0013).
- yt-dlp needs a JS runtime (Deno) since Nov 2025; keep it in the Docker image.
- Marks: `network` (hits YouTube; excluded by default), `integration` (needs models), `slow`. CI runs offline + integration (ONNX) and builds the arm64 image under QEMU.
- Real YouTube/ARM64 runs are verified on Kevin's VPS, not in the cloud sandbox: report as unverified until then.

## Working rules
- Authorship: commits/PRs as Kevin David Zorro Hernández <kevindavidzorro@gmail.com>, no `Co-Authored-By`, `Claude-Session` or AI mentions. `.claude/hooks/git-guard.sh` sets identity at session start; run `bash .claude/hooks/git-guard.sh check` before push.
- Conventional Commits; small increments, each with green tests, clean linters; squash merge; no push to `main`.
- Short plan before each phase; ADR for architecture changes; update `docs/status.md` at the end of each increment block.
- Skills: `desarrollo-senior`, `arquitectura-y-datos`, `calidad-y-seguridad`, `ml-e-investigacion`; `frontend-design`/`impeccable` for UI.
