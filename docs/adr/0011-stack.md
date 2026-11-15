# 0011. D-11 Stack tecnológico

- Fecha: 2026-11-14
- Estado: Propuesta
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-11)

## Contexto
FastAPI se impone porque yt-dlp, Basic Pitch, music21 y el modelo de ByteDance son de Python. React con TypeScript tiene el ecosistema necesario y suma al portafolio Full Stack.

## Decisión
Frontend: React, TypeScript y Vite, Web MIDI API, YouTube IFrame API, @tonejs/midi, Tone.js y OpenSheetMusicDisplay. Backend: FastAPI con yt-dlp, Basic Pitch y music21. Docker Compose y Nginx con HTTPS en la VPS de Oracle. La Fase 0 usa solo el backend como CLI; la arquitectura es hexagonal (dominio, aplicación, infraestructura) con puertos para yt-dlp, los modelos y el proxy.

## Alternativas consideradas
- Backend propio para servir la interfaz: Nginx basta para estáticos y un proceso menos es un punto de falla menos.

## Consecuencias
Calidad exigida: TypeScript estricto, mypy, Ruff, ESLint, Prettier, pytest, Vitest, Testing Library y Playwright, todo en GitHub Actions.
