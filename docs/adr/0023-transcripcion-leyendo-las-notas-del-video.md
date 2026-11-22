# ADR 0023 — Transcripción leyendo las notas que caen del video

Estado: **Propuesta** (idea de Kevin, 2026-11-22). Hay un prototipo medido con videos sintéticos (ver «Prototipo»); se decide con los números de videos reales en la VPS. Modifica D-04 (se baja también la imagen, no solo el audio) y complementa D-06 y el ADR 0014.

## Contexto

Muchos covers de YouTube son tutoriales con **notas que caen sobre un teclado dibujado** (estilo Synthesia). Salen de un archivo MIDI: las notas, su duración y a menudo la mano (un color por mano) están exactas en la imagen. ByteDance transcribe el audio muy bien (10 de 10 reconocibles en la Fase 0), pero cambia notas, funde acordes y pierde adornos; el modo «Retroceso automático» (ADR 0022) hereda esos errores como retrocesos injustos, porque la transcripción es su hoja de respuestas.

Kevin propuso leer las notas de las imágenes. Su duda: el costo de pasar muchas imágenes a un modelo.

## Decisión propuesta

1. **Sin IA: visión clásica sobre las filas que importan.** No se le dan fotogramas a un modelo. Por cada video (detalle en [`phase-1/lectura-de-video.md`](../phase-1/lectura-de-video.md)):
   - La mediana de 32 fotogramas clave deja el teclado sin barras ni teclas iluminadas. Ahí se localizan las teclas y su nota: qué separaciones entre teclas blancas llevan tecla negra da el nombre; la octava sale del tamaño del teclado (88 → la primera es La0; también 76, 61, 49 y 37) o, si no es estándar, de centrarlo en el Do central. Si queda corrido, se nota al compararlo con ByteDance.
   - En cada fotograma (480p, hasta 30 por segundo) se leen la franja justo encima del teclado y las teclas. La franja se desenrolla en una línea de tiempo más fina que un fotograma: la fila que está a *d* píxeles de la línea muestra lo que llega *d / velocidad* segundos después. Las teclas iluminadas deciden qué notas existen; las barras, su inicio y final. Si no se iluminan, bastan las barras. El color de la barra da la mano.
   - El resultado es la misma lista de notas que entrega ByteDance, y sigue por el mismo camino: pulso, cuantización, reducción de polifonía y MusicXML (ADR 0017 y 0018).
2. **Nuevo adaptador detrás de un puerto** (`VideoNoteReader`), elegido en la composición; el dominio no cambia. yt-dlp baja, además del audio, la imagen en 480p (H.264, hasta 30 fps) sin sonido.
3. **Solo cuando el video sirve.** Si no aparece un teclado dibujado, no caen barras o la lectura discrepa mucho de ByteDance, se usa la transcripción de audio como hoy. El umbral se fija con los videos reales (por ejemplo, F1 de inicios a ±100 ms menor que 0,6). Cada canción guarda de qué fuente salió.
4. **Nada se guarda**: el video se borra al terminar, como el audio (ADR 0016).

## Prototipo (2026-11-22)

`notacaida videonotes run` lee cada video, transcribe su audio con ByteDance o Basic Pitch y compara las listas de notas (F1 por nota, desfase, transposición), sin tocar la app. Medido con 21 videos sintéticos de notas conocidas (7 estilos genéricos por 3 piezas generadas en código), en x86:

- **21 de 21 leídos.** F1 contra las notas verdaderas (misma tecla, inicio a ±50 ms): mediana **1,000**, peor **0,997**; exigiendo también el final, peor 0,970. Desfase de +2 a +8 ms.
- Manos por color correctas en el 99–100 % de las notas, en 17 de 18 videos con dos colores.
- Solo con barras falla un estilo: barras blancas tan anchas como la tecla, sin borde ni hueco, inventan notas negras (F1 0,82–0,87). Con teclas iluminadas se corrige (1,000).

**Sin verificar** con tutoriales reales de YouTube ni en el Ampere A1. Para decidir, Kevin corre el comando en la VPS con 5–10 tutoriales y se mira: cuántos se leen; el F1 alineado contra ByteDance (alto: leen la misma canción; donde difieren, `video.wav` frente a `bytedance.wav` dice de oído quién acierta), y el tiempo y la memoria de la lectura en 2 OCPU.

## Costo medido

- Prototipo, x86 y un núcleo por proceso: leer el video toma un **8 % de su duración** en 480p a 30 fps (unos 19 s para una canción de 4 min) con unos 150 MB; en 720p a 60 fps, un 18–24 % y 440 MB. En el Ampere A1 se espera más lento, sin medir. ByteDance tarda ≈ 6 min por canción: leer la imagen cuesta mucho menos que escuchar el audio.
- Descarga: unos 10–20 MB más por canción en 480p, por el proxy de casa (el informe mide cada video).

## Alternativas consideradas

- **Darle fotogramas a un modelo de visión cada 5 s** (la primera idea): caro, con una resolución de 5 s en el tiempo, sin duraciones exactas y poco fiable.
- **Leer el video en el navegador**: el reproductor de YouTube es un iframe de otro origen y no deja leer sus píxeles; capturar la pestaña pide permiso de pantalla y obliga a reproducir la canción entera.
- **Seguir solo con el audio**: más simple, pero el modo con retroceso queda tan fiable como ByteDance.

## Consecuencias

- Notas, duraciones y manos exactas en los videos con notas que caen (la mayoría de los tutoriales), mejor partitura y retrocesos justos.
- **No arregla la detección por micrófono**: esto mejora la hoja de respuestas, no lo que se oye del teclado del usuario.
- Más descarga por canción y la misma exposición legal que el audio (ADR 0004). Videos con manos reales, cámaras en movimiento o efectos que tapan el teclado siguen con ByteDance.
- **Sin verificar con videos reales**: el prototipo existe, pero desde el entorno de desarrollo no se llega a YouTube; los números reales salen de la VPS.
