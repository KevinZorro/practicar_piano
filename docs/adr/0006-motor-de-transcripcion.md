# 0006. D-06 Motor de transcripción

- Fecha: 2026-11-14
- Estado: Pendiente de prueba
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-06)

## Contexto
Transcribir en el navegador obligaría a enviarle el audio completo. En la VPS el audio no sale del servidor. Basic Pitch (Apache 2.0) es liviano e independiente del instrumento; el modelo de piano de ByteDance (F1 96,72 % en el inicio de notas sobre MAESTRO) solo sirve para piano y es más pesado.

## Decisión
Basic Pitch como base y el modelo de ByteDance si la prueba lo justifica. **La Fase 0 resuelve esta decisión**: diez covers, ambos modelos, compuerta 1 (≥ 8 de 10 reconocibles y < 2 min por canción de 3 min). Si ByteDance gana con claridad y cumple el tiempo en 2 OCPU, reemplaza a Basic Pitch en el mismo servicio. Los modelos viven detrás del puerto `Transcriber`.

## Alternativas consideradas
- Transcripción en el navegador: expone el audio y depende del equipo del usuario.

## Consecuencias
La cola procesa una canción a la vez y la interfaz mostrará posición y progreso. Estado se actualiza a Aceptada o Reemplazada con los resultados de la Fase 0.
