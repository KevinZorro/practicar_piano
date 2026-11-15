# Estado del proyecto

Última actualización: 2026-11-15 · Fase actual: **Fase 0** (compuerta 1)

## Hecho
- [x] Andamiaje: licencia MIT, NOTICE, .gitignore, pre-commit, CLAUDE.md, git-guard
- [x] ADR 0001–0012 (D-01 a D-12) y arquitectura

## En curso / pendiente
- [ ] Tooling del backend y CI
- [ ] Validación de enlaces, puertos y orquestador con dobles de prueba
- [ ] Adaptadores (yt-dlp, Basic Pitch, ByteDance, sintetizador, medidor)
- [ ] CLI, informe y prueba de integración
- [ ] Dockerfile linux/arm64 con Deno y ffmpeg
- [ ] Runbook de la VPS y criterios de la compuerta

## No verificado (requiere la VPS)
- Descarga real desde YouTube, memoria y tiempos reales por modelo, imagen en ARM64.

## Decisiones abiertas
- D-06 (motor de transcripción): la resuelve esta fase.
- Nombre definitivo del proyecto (`pianola` es provisional).
