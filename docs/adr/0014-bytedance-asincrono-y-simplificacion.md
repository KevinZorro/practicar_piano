# 0014. ByteDance como motor principal, procesado asíncrono, y simplificación para tocar

- Fecha: 2026-11-15
- Estado: Aceptada (confirmada por Kevin el 2026-11-15)
- Relacionada con: [0006](0006-motor-de-transcripcion.md), [0008](0008-visualizacion-y-practica.md)

## Contexto
Resultados de la Fase 0 con diez covers de audio local en la VPS (2 OCPU, aarch64):

| Modelo | Factor de tiempo real (mediana / peor) | Memoria pico | Calidad a oído |
| --- | --- | --- | --- |
| Basic Pitch (ONNX) | 0,04 / 0,12 | 505 MB | suena raro, mucho peor |
| ByteDance | 1,98 / 2,07 | 1,5 GB | casi idéntico al original |

ByteDance incumple el criterio «< 2 min por canción de 3 min» (tarda ≈ 6 min). Kevin comparó los MIDI de ambos modelos y prefiere ByteDance con claridad. Además observó que en una canción difícil la transcripción pide más de 15 teclas a la vez, algo imposible de tocar.

## Decisión (propuesta)
1. ByteDance pasa a ser el motor principal; Basic Pitch queda como respaldo o vista previa rápida.
2. El procesado es **asíncrono**: el usuario envía el enlace, ve la posición en la cola y recibe aviso al terminar (≈ 6 a 8 min por canción de 3). El resultado se guarda para no repetir el trabajo. Esto relaja de forma explícita el criterio de tiempo de la compuerta 1 para ByteDance.
3. La transcripción cruda no es lo que se practica: la Fase 1 incluye un paso de **simplificación para tocar** (limitar la polifonía a un máximo de notas simultáneas, separar mano izquierda y derecha, niveles de dificultad).

## Alternativas consideradas
- Mantener Basic Pitch por velocidad: descartado por calidad.
- Acelerar ByteDance (cuantización, ONNX, trocear en paralelo): se puede intentar más adelante, con ganancia incierta en 2 CPU.
- Más hardware (GPU o más CPU): rompe el objetivo de coste cero.

## Consecuencias
- La cola de trabajos pasa de «conveniente» a obligatoria; una canción a la vez con 12 GB de memoria alcanza.
- Hay que decidir la política de caché y borrado de resultados (ADR 0007).
- Pendiente: licencia del checkpoint (ADR 0013), veredictos de oído para cerrar la compuerta 1 y el contrato de la simplificación.
