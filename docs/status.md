# Estado del proyecto

Última actualización: 2026-11-15 · Fase actual: **Fase 0** (compuerta 1) · Rama: `claude/project-thread-7gi51h`

## Hecho
- [x] Andamiaje: licencia MIT, NOTICE, .gitignore (bloquea medios y modelos), pre-commit, CLAUDE.md, git-guard
- [x] ADR 0001–0012 (D-01 a D-12), ADR 0013 (checkpoint de ByteDance verificado) y arquitectura
- [x] Backend hexagonal: validación de enlaces, puertos, orquestador, regla de la compuerta, informe y `verdicts.csv`
- [x] Adaptadores: yt-dlp (proxy opcional), Basic Pitch sobre ONNX, ByteDance, sintetizador WAV, medidor de memoria por subproceso
- [x] CLI `pianola phase0 run | gate`, con `--audio-dir` para audio local (respaldo si YouTube bloquea la descarga)
- [x] Pruebas: unitarias sin red, integración con Basic Pitch real y una melodía de dominio público generada en código, prueba de red marcada aparte (`PIANOLA_TEST_VIDEO_URL`)
- [x] CI (Ruff, mypy estricto, pytest en 3.11 y 3.12, integración, gitleaks) y flujo que construye la imagen arm64 bajo QEMU
- [x] Dockerfile linux/arm64 con Deno y ffmpeg, compose y runbook de la VPS

## Verificado en el entorno de desarrollo (x86_64, Python 3.11 y 3.12)
- 98 pruebas en verde, Ruff y mypy limpios; Basic Pitch ONNX transcribe una melodía sintetizada de dominio público.

## No verificado (requiere la VPS o la CI)
- Descarga real desde YouTube (sin red a YouTube ni Deno en el entorno de desarrollo).
- Modelo de ByteDance real (PyTorch y checkpoint no se instalaron; el adaptador se probó con un doble).
- Construcción y ejecución de la imagen en ARM64 (no había daemon de Docker; lo cubre el flujo `docker-arm64` de la CI).
- Tiempos y memoria reales por modelo en 2 OCPU.
- Licencia del checkpoint de ByteDance (Zenodo inaccesible desde el entorno): ver `docs/phase-0/model-licenses.md`.

## Resultado en la VPS (2026-11-14)
- Descarga directa: **bloqueada por YouTube** en las 10 canciones (`Sign in to confirm you're not a bot`). Falta probar el proxy de casa con WireGuard (ADR 0004).
- Modelos: pendientes; se evalúan con audio local (`--audio-dir`).

## Fase 1
- Plan redactado en `docs/phase-1/plan.md`; **pendiente del visto bueno de Kevin**. No hay código de la Fase 1.

## Siguiente paso
Correr el runbook (`docs/phase-0/runbook.md`) en la VPS con diez covers y decidir la compuerta 1.

## Decisiones abiertas
- D-06 (motor de transcripción): la resuelve la prueba.
- Nombre definitivo del proyecto (`pianola` es provisional).
- Licencia exacta del código y del checkpoint de ByteDance (ADR 0013).
