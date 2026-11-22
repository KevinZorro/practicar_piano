# ADR 0023 — Transcripción leyendo las notas que caen del video

Estado: **Propuesta** (idea de Kevin, 2026-11-22; pendiente de su visto bueno antes de implementar). Modifica D-04 (se baja también la imagen, no solo el audio) y complementa D-06 y el ADR 0014.

## Contexto

Muchos covers de YouTube son tutoriales con **notas que caen sobre un teclado dibujado** (estilo Synthesia). Salen de un archivo MIDI: las notas, su duración y a menudo la mano (un color por mano) están exactas en la imagen. ByteDance transcribe el audio muy bien (10 de 10 reconocibles en la Fase 0), pero cambia notas, funde acordes y pierde adornos; el modo «Retroceso automático» (ADR 0022) hereda esos errores como retrocesos injustos, porque la transcripción es su hoja de respuestas.

Kevin propuso leer las notas de las imágenes. Su duda: el costo de pasar muchas imágenes a un modelo.

## Decisión propuesta

1. **Sin IA: visión clásica sobre una franja de píxeles.** No se le dan fotogramas a un modelo. Por cada video:
   - Se localiza una vez el teclado dibujado (la alternancia de teclas blancas y negras en la parte baja del cuadro), los bordes de cada tecla y su nota: los grupos de 2 y 3 teclas negras dan el nombre; la octava sale de contar las teclas (88 → la primera es La0) o, si el teclado está recortado, de alinear el histograma de alturas con la transcripción de ByteDance.
   - En cada fotograma (480p, 30 por segundo) se lee una franja de 1 a 4 píxeles justo encima del teclado: una tecla «suena» mientras su columna tiene el color de una barra (o la tecla se ilumina). Los cambios dan inicio y fin de cada nota con la precisión de un fotograma (33 ms); el color de la barra da la mano.
   - El resultado es la misma lista de notas que entrega ByteDance, y sigue por el mismo camino: pulso, cuantización, reducción de polifonía y MusicXML (ADR 0017 y 0018).
2. **Nuevo adaptador detrás de un puerto** (`VideoNoteReader`), elegido en la composición; el dominio no cambia. yt-dlp baja, además del audio, la imagen en 480p sin sonido.
3. **Solo cuando el video sirve.** Si no aparece un teclado dibujado o la lectura discrepa mucho de ByteDance (por ejemplo, F1 de inicios a ±100 ms menor que 0,6), se usa la transcripción de audio como hoy. Cada canción guarda de qué fuente salió.
4. **Nada se guarda**: el video se borra al terminar, como el audio (ADR 0016).

## Costo medido

- Decodificar un video de 720p a 30 fps y extraer la franja: **483 fotogramas por segundo en un solo núcleo** x86 (60 s de video en 3,7 s). Una canción de 4 min en 480p toma unos 15 s en un núcleo; en el Ampere A1 se estima menos de 1 min. ByteDance tarda ≈ 6 min por canción: leer la imagen cuesta mucho menos que escuchar el audio.
- Descarga: unos 10–20 MB más por canción en 480p, por el proxy de casa.

## Alternativas consideradas

- **Darle fotogramas a un modelo de visión cada 5 s** (la primera idea): caro, con una resolución de 5 s en el tiempo, sin duraciones exactas y poco fiable.
- **Leer el video en el navegador**: el reproductor de YouTube es un iframe de otro origen y no deja leer sus píxeles; capturar la pestaña pide permiso de pantalla y obliga a reproducir la canción entera.
- **Seguir solo con el audio**: más simple, pero el modo con retroceso queda tan fiable como ByteDance.

## Consecuencias

- Notas, duraciones y manos exactas en los videos con notas que caen (la mayoría de los tutoriales), mejor partitura y retrocesos justos.
- **No arregla la detección por micrófono**: esto mejora la hoja de respuestas, no lo que se oye del teclado del usuario.
- Más descarga por canción y la misma exposición legal que el audio (ADR 0004). Videos con manos reales, cámaras en movimiento o efectos que tapan el teclado siguen con ByteDance.
- **Sin verificar**: hace falta un prototipo con 5–10 videos reales en la VPS (desde el entorno de desarrollo no se llega a YouTube).
