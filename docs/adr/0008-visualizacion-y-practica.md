# 0008. D-08 Visualización de notas y modo práctica

- Fecha: 2026-11-14
- Estado: Propuesta
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-08)

## Contexto
El Canvas 2D alcanza para el MVP y deja las horas para la sincronía entre video, notas, partitura y teclado.

## Decisión
Notas cayendo en Canvas 2D sobre un teclado en pantalla junto al reproductor. Modo espera con retroceso configurable (por defecto 5 s; se mide en segundos porque la transcripción no entrega compases). Manos separadas por una regla simple: izquierda por debajo del do central. Velocidad al 75 % o 50 % con YouTube; 50–100 % con el piano de Tone.js.

## Alternativas consideradas
- WebGL: mejores efectos a costa de más horas.

## Consecuencias
La regla de manos falla si se cruzan. Los segundos de retroceso se ajustan con usuarios reales.
