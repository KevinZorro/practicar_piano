# syntax=docker/dockerfile:1.7
#
# Phase 0 benchmark image. Built for linux/arm64 (Oracle Ampere A1); also builds on amd64.
#   docker buildx build --platform linux/arm64 -t notacaida-phase0 backend
#
# Python 3.11 because basic-pitch's own metadata only supports it on Linux; Basic Pitch runs
# on onnxruntime (TensorFlow is dropped, see docs/adr/0006). Deno is yt-dlp's JavaScript
# runtime: YouTube extraction needs it and it must be refreshed when YouTube changes.

ARG PYTHON_VERSION=3.11
ARG DENO_VERSION=2.1.4
ARG UV_VERSION=0.5.14

FROM denoland/deno:bin-${DENO_VERSION} AS deno
FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

# ---- build: resolve and install locked dependencies into a venv ----------------------
FROM python:${PYTHON_VERSION}-slim-bookworm AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project \
        --extra synth --extra basic-pitch --extra bytedance --extra score
COPY src ./src
# --reinstall-package: uv keeps the wheel it built for a local project in its cache and only
# rebuilds it when pyproject.toml changes, so on a host with a persistent cache (the VPS) the
# image kept shipping old code after a merge. Always rebuild the project from ./src.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable --reinstall-package notacaida \
        --extra synth --extra basic-pitch --extra bytedance --extra score

# ---- runtime ------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deno /deno /usr/local/bin/deno
COPY --from=build /opt/venv /opt/venv
COPY scripts /app/scripts

# Non-root. The compose file runs it as the host user so output files are yours.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin notacaida \
    && mkdir -p /data /models && chown notacaida /data /models
ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp \
    MPLCONFIGDIR=/tmp/matplotlib \
    NUMBA_CACHE_DIR=/tmp/numba \
    NOTACAIDA_BYTEDANCE_CHECKPOINT=/models/note_F1=0.9677_pedal_F1=0.9186.pth
USER notacaida
WORKDIR /data

# The same image runs the Phase 0 CLI (ENTRYPOINT) and the Phase 1 API (see infra/docker-compose.yml, which sets its own healthcheck). Fail the build if the toolchain is broken.
RUN deno --version && ffmpeg -version | head -n 1 && notacaida --help > /dev/null

ENTRYPOINT ["notacaida"]
CMD ["--help"]
