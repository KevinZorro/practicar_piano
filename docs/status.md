# Estado del proyecto

Última actualización: 2026-11-17 · Fase actual: **Fase 1** (en curso) · Rama: `claude/project-thread-tgbyej`

## Hecho
- [x] Andamiaje: licencia MIT, NOTICE, .gitignore (bloquea medios y modelos), pre-commit, CLAUDE.md, git-guard
- [x] ADR 0001–0012 (D-01 a D-12), ADR 0013 (checkpoint de ByteDance verificado) y arquitectura
- [x] Backend hexagonal: validación de enlaces, puertos, orquestador, regla de la compuerta, informe y `verdicts.csv`
- [x] Adaptadores: yt-dlp (proxy opcional), Basic Pitch sobre ONNX, ByteDance, sintetizador WAV, medidor de memoria por subproceso
- [x] CLI `pianola phase0 run | gate`, con `--audio-dir` para audio local (respaldo si YouTube bloquea la descarga)
- [x] Pruebas: unitarias sin red, integración con Basic Pitch real y una melodía de dominio público generada en código, prueba de red marcada aparte (`PIANOLA_TEST_VIDEO_URL`)
- [x] CI (Ruff, mypy estricto, pytest en 3.11 y 3.12, integración, gitleaks) y flujo que construye la imagen arm64 bajo QEMU
- [x] Dockerfile linux/arm64 con Deno y ffmpeg, compose y runbook de la VPS
- [x] Proxy de casa por WireGuard: configuración de la VPS y del PC (Windows), proxy `gost`, sonda `check-proxy` en compose y runbook (ADR 0015)

## Verificado en el entorno de desarrollo (x86_64, Python 3.11 y 3.12)
- 98 pruebas en verde, Ruff y mypy limpios; Basic Pitch ONNX transcribe una melodía sintetizada de dominio público.

## No verificado (requiere la VPS o la CI)
- Descarga real desde YouTube (sin red a YouTube ni Deno en el entorno de desarrollo).
- Modelo de ByteDance real (PyTorch y checkpoint no se instalaron; el adaptador se probó con un doble).
- Construcción y ejecución de la imagen en ARM64 (no había daemon de Docker; lo cubre el flujo `docker-arm64` de la CI).
- Tiempos y memoria reales por modelo en 2 OCPU.
- Licencia del checkpoint de ByteDance (Zenodo inaccesible desde el entorno): ver `docs/phase-0/model-licenses.md`.

## Resultado en la VPS (2026-11-14)
- Descarga directa: **bloqueada por YouTube** en las 10 canciones (`Sign in to confirm you're not a bot`). Plan B con proxy de casa (ADR 0004, 0015): ver la línea siguiente y `docs/phase-0/proxy-casa-wireguard.md`.
- Proxy de casa por WireGuard (2026-11-16, Kevin): túnel y proxy `gost` en Windows operativos; `check-tunnel.sh` 5/5 OK y `check-proxy` devuelve `HTTP/2 200` desde un contenedor. La descarga real de la primera canción por el proxy funcionó (se generó el audio, sin `Sign in to confirm you're not a bot`). **Verificado en 1 de 10 canciones**: se cortó la corrida con Ctrl+C durante ByteDance, sin `report.md`; las otras 9 siguen sin probar. Gotcha: `gost` lo marca Windows Defender/VirusTotal como PUA (herramienta de doble uso, hash verificado); exclusión solo de `C:\ProgramData\pianola-proxy`.
- Audio local con `--audio-dir`, 10 canciones: Basic Pitch factor 0,04 (mediana) y 0,12 (peor), 505 MB; ByteDance factor ≈ 2,0 (≈ 6 min por canción de 3), 1,5 GB. Corregido un fallo de carga de audio con librosa 0.11.
- A oído (Kevin): ByteDance mucho mejor, casi idéntico al original; Basic Pitch suena raro. Propuesta: ByteDance asíncrono ([0014](adr/0014-bytedance-asincrono-y-simplificacion.md)). Veredicto de Kevin (por oído, 2026-11-15): **10 de 10 reconocibles con ByteDance**; no se rellenó `verdicts.csv` ni se corrió `gate`, su palabra es el veredicto.
- **Compuerta 1:** calidad cumplida (10/10); el criterio de tiempo original (< 2 min) no se cumple con ByteDance (≈ 6 min) y se acepta con procesado asíncrono.
- Observación: transcripciones con más de 15 notas simultáneas no se pueden tocar; la Fase 1 necesita simplificación.

## Fase 1
- Plan en `docs/phase-1/plan.md`; Kevin respondió la sección 9 (2026-11-17): ADR [0016](adr/0016-entrega-sin-cache-y-limites.md) (sin caché, 10 min, cola 1+5, aviso por notificación, nombre Pianola) y [0017](adr/0017-reduccion-de-polifonia.md) (polifonía).
- Hecho: C0 (andamiaje frontend y CI), C1 (modelo de notas y máquina del modo espera), A1 (trabajo, `SubmitJob`, `ProcessJob`), A2 (cola acotada, límites por IP, almacén con expiración, worker), A3 (API FastAPI con SSE, errores con código, `docs/api/openapi.json` con prueba de contrato), C2 (reloj interpolado y adaptador de YouTube), C3 (proyección y dibujo de notas; falta el componente React del canvas y el teclado en pantalla), C4 (Web MIDI y detección de navegador; falta la guía en la interfaz).
- Hecho después (PR siguiente): B1b (`domain/polyphony.py`, ADR 0017 implementado) y C5 (cliente de la API con tipos generados de OpenAPI, `JobTracker` con seguimiento por consulta y trabajos que sobreviven a cerrar la pestaña, pantalla del enlace y la cola, notificación del navegador y título de pestaña; e2e con la API simulada). El aviso con sonido queda pendiente.
- Hecho después: B1 (tempo), B2 (cuantización y manos), B3 (MusicXML con music21 y timemap), ADR [0018](adr/0018-pulso-cuantizacion-y-partitura.md).
- Hecho después: B4 (`BuildResult`: tras transcribir se entregan los tres niveles —original, jugable, fácil— y la partitura MusicXML con su timemap de los dos reducidos; `GET /result` cambia a `{meta, levels[]}`).
- Hecho después: C8 en parte (`core/library`: progreso por nivel, «dominada» con ≥ 90 % de acierto, velocidad 1 y sin modo espera, exportar e importar; `IndexedDbLibrary` con migraciones v1→v2 probada con `fake-indexeddb`; `collect` guarda la canción antes de borrarla del servidor). Falta la pantalla de biblioteca y mover los trabajos pendientes de localStorage a IndexedDB (su almacén es síncrono; se hará con C6).
- Pendiente de la Fase 1: C6–C9, A4–A6, D1–D3; C8 cambiará el almacén de trabajos pendientes de localStorage a IndexedDB. Sin verificar: Playwright de CI, YouTube y ARM64 reales, modelos reales en la API (la composición con adaptadores reales llega con A4/A5).
- Límites conocidos: la cola y los resultados viven en memoria; un reinicio los pierde (ADR 0016).

## Siguiente paso
Seguir con C6 (partitura con cursor) y C7 (Tone.js, velocidad, nivel). En paralelo, confirmar la descarga por el proxy en las 10 canciones (`phase0 run --links ... --models basic-pitch`, rápido) y decidir si el PC de casa sirve en la Fase 1 o se usa el proxy residencial de pago (ADR 0004).

## Decisiones abiertas
- D-06 (motor de transcripción): resuelta a favor de ByteDance asíncrono (ADR 0014, aceptada).
- Nombre definitivo del proyecto (`pianola` es provisional).
- Checkpoint de ByteDance: licencia CC BY 4.0 verificada (atribución en `NOTICE`); falta contrastar MD5 y fijar SHA-256 (ADR 0013).
