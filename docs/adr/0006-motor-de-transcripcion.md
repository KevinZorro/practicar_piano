# 0006. D-06 Motor de transcripción

- Fecha: 2026-11-14
- Estado: Aceptada (ByteDance asíncrono, ver 0014)
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-06)

## Contexto

Transcribir en el navegador obligaría a enviarle el audio completo. En la VPS el audio no sale del servidor. Basic Pitch (Apache 2.0) es liviano e independiente del instrumento; el modelo de piano de ByteDance (F1 96,72 % en el inicio de notas sobre MAESTRO) solo sirve para piano y es más pesado.

## Decisión

Basic Pitch como base y el modelo de ByteDance si la prueba lo justifica. **La Fase 0 resuelve esta decisión**: diez covers, ambos modelos, compuerta 1 (≥ 8 de 10 reconocibles y < 2 min por canción de 3 min). Si ByteDance gana con claridad y cumple el tiempo en 2 OCPU, reemplaza a Basic Pitch en el mismo servicio. Los modelos viven detrás del puerto `Transcriber`.

## Alternativas consideradas

- Transcripción en el navegador: expone el audio y depende del equipo del usuario.

## Consecuencias

La cola procesa una canción a la vez y la interfaz mostrará posición y progreso. Estado se actualiza a Aceptada o Reemplazada con los resultados de la Fase 0.

## Actualización 2026-11-15 (implementación de la Fase 0)

- `basic-pitch` 0.4.0 declara `tensorflow<2.15.1` como dependencia obligatoria en Linux (solo hay ruedas para Python 3.11), incluso con el extra `onnx`. Para no depender de TensorFlow en ARM64, el proyecto lo excluye con `override-dependencies` en `backend/pyproject.toml` y Basic Pitch corre sobre `onnxruntime`. Es una elección de ejecución, no cambia la decisión.
- El modelo de ByteDance se carga con un checkpoint verificado: ver [0013](0013-checkpoint-bytedance-verificado.md).
- La compuerta usa el tiempo de inferencia con el modelo ya cargado (el servidor lo cargará una vez al arrancar) y el informe muestra también el tiempo total con arranque en frío.

## Actualización 2026-11-15 (resultado de la Fase 0)

Con diez covers en la VPS, ByteDance resultó reconocible en 10 de 10 y Basic Pitch claramente peor a oído; ByteDance tarda ≈ 2× la duración (incumple el criterio de 2 min) y se propone usarlo de forma asíncrona. Ver [0014](0014-bytedance-asincrono-y-simplificacion.md).
