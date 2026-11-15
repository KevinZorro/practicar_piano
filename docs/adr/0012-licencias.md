# 0012. D-12 Licencias y código abierto

- Fecha: 2026-11-14
- Estado: Propuesta
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-12)

## Contexto
Un repositorio abierto da valor de portafolio. La licencia MIT no impide poner anuncios ni cobrar después.

## Decisión
Código bajo licencia MIT y solo dependencias permisivas: Basic Pitch y el modelo de ByteDance (Apache 2.0, conservar avisos), music21 y OpenSheetMusicDisplay (BSD-3), yt-dlp (Unlicense). Los avisos están en `NOTICE`. El repositorio no incluye audio ni MIDI de canciones protegidas; los ejemplos usan obras de dominio público.

## Alternativas consideradas
- Reutilizar PianoBooster o Neothesia: licencias GPL obligarían a publicar todo bajo GPL.

## Consecuencias
Pendiente de verificar en la Fase 0: la licencia del checkpoint preentrenado de ByteDance (el código es Apache 2.0). Si difiere, se registra un ADR antes de usarlo. Ver `docs/phase-0/model-licenses.md`.
