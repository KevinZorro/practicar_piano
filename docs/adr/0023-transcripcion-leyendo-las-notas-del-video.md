# ADR 0023 — Transcripción leyendo las notas que caen del video

Estado: **Propuesta** (idea de Kevin, 2026-11-22). Hay un prototipo medido con videos sintéticos y una primera medición con 10 canciones reales en la VPS (ver «Prototipo» y «Primera medición real»); se decide cuando el detector encuentre los tutoriales que todavía no encuentra. Modifica D-04 (se baja también la imagen, no solo el audio) y complementa D-06 y el ADR 0014.

## Contexto

Muchos covers de YouTube son tutoriales con **notas que caen sobre un teclado dibujado** (estilo Synthesia). Salen de un archivo MIDI: las notas, su duración y a menudo la mano (un color por mano) están exactas en la imagen. ByteDance transcribe el audio muy bien (10 de 10 reconocibles en la Fase 0), pero cambia notas, funde acordes y pierde adornos; el modo «Retroceso automático» (ADR 0022) hereda esos errores como retrocesos injustos, porque la transcripción es su hoja de respuestas.

Kevin propuso leer las notas de las imágenes. Su duda: el costo de pasar muchas imágenes a un modelo.

## Decisión propuesta

1. **Sin IA: visión clásica sobre las filas que importan.** No se le dan fotogramas a un modelo. Por cada video (detalle en [`phase-1/lectura-de-video.md`](../phase-1/lectura-de-video.md)):
   - La mediana de 32 fotogramas clave deja el teclado sin barras ni teclas iluminadas. Ahí se localizan las teclas y su nota: qué separaciones entre teclas blancas llevan tecla negra da el nombre; la octava sale del tamaño del teclado (88 → la primera es La0; también 76, 61, 49 y 37) o, si no es estándar, de centrarlo en el Do central. Si queda corrido, se nota al compararlo con ByteDance.
   - En cada fotograma (480p, hasta 30 por segundo) se leen las teclas y la franja justo encima del teclado. Si el video ilumina las teclas que suenan, sus notas son la lectura, con inicio y final a un fotograma. Si no las ilumina, se leen las barras: la franja se desenrolla en una línea de tiempo más fina que un fotograma (la fila que está a *d* píxeles de la línea muestra lo que llega *d / velocidad* segundos después). El color de la barra da la mano, también a la tecla iluminada sobre la que cae.
   - El resultado es la misma lista de notas que entrega ByteDance, y sigue por el mismo camino: pulso, cuantización, reducción de polifonía y MusicXML (ADR 0017 y 0018).
2. **Nuevo adaptador detrás de un puerto** (`VideoNoteReader`), elegido en la composición; el dominio no cambia. yt-dlp baja, además del audio, la imagen en 480p (H.264, hasta 30 fps) sin sonido.
3. **Solo cuando el video sirve.** Si no aparece un teclado dibujado, no caen barras o la lectura discrepa mucho de ByteDance, se usa la transcripción de audio como hoy. El umbral se fija con los videos reales (por ejemplo, F1 de inicios a ±100 ms menor que 0,6). Cada canción guarda de qué fuente salió.
4. **Nada se guarda**: el video se borra al terminar, como el audio (ADR 0016).

## Prototipo (2026-11-22)

`notacaida videonotes run` lee cada video, transcribe su audio con ByteDance o Basic Pitch y compara las listas de notas (F1 por nota, desfase, transposición), sin tocar la app. Medido con 24 videos sintéticos de notas conocidas (8 estilos genéricos por 3 piezas generadas en código), en x86, ya con las teclas iluminadas como lectura preferida:

- **24 de 24 leídos.** F1 contra las notas verdaderas (misma tecla, inicio a ±50 ms): mediana **0,999**, peor **0,994** (una repetición cuyo hueco cae entre dos fotogramas); exigiendo también el final, peor 0,985. Desfase de medio fotograma como mucho.
- Manos por color correctas en el 99–100 % de las notas, en 20 de 21 videos con dos colores.
- Solo con barras falla un estilo: barras blancas tan anchas como la tecla, sin borde ni hueco, inventan notas negras (F1 0,82–0,87). Con teclas iluminadas no pasa (0,995–1,000).

## Primera medición real (2026-11-22)

Kevin corrió el prototipo en la VPS (Ampere A1, 2 OCPU) con las 10 canciones de `links.txt`, contra ByteDance. Detalle en [`phase-1/lectura-de-video.md`](../phase-1/lectura-de-video.md).

- **Se leyeron 4 de 10.** En 5 no se encontró un teclado dibujado: dos son covers, quizá tocados en un piano de verdad, pero dos son tutoriales que, por el título, deberían tener notas que caen; falta diagnosticarlos. Uno no se pudo bajar (YouTube respondió 403 al pedir la imagen).
- **Las teclas iluminadas son lo fiable.** En los 3 tutoriales que las iluminan coinciden con ByteDance en F1 **0,978, 0,958 y 0,887** (precisión 0,88–0,99, recall 0,89–0,97), una vez descontado un desfase constante de −13 a −91 ms entre la imagen y el sonido.
- **Las barras, no.** Solas inventan notas (precisión 0,37–0,56), y su desfase frente a las teclas cambia de un video a otro (de −20 a +94 ms). La lectura que mezclaba teclas y barras quedó por debajo de las teclas solas en los tres (0,629, 0,921 y 0,847), así que se quitó: ahora se prefieren las teclas, y las barras solo se usan si el video no las ilumina y para el color de la mano. En el único video leído sin teclas iluminadas las barras no coincidieron con ByteDance (F1 0,033); falta ver su imagen para saber por qué.
- Con ese cambio, la mediana de las 4 canciones leídas pasa de 0,738 a 0,92: la lectura de las teclas no cambió.

Falta para decidir: que el detector encuentre los tutoriales que no encontró (el informe ahora dice qué paso falló y guarda la imagen de fondo), entender el video sin teclas iluminadas y oír en dos o tres canciones dónde difieren el video y ByteDance (`video.wav` frente a `bytedance.wav`).

### Segunda medición (2026-11-22)

Con el detector corregido según las imágenes de la primera corrida, **7 de 10 leídos** (antes 4). Los tutoriales con teclas iluminadas coinciden con ByteDance en F1 0,978, 0,958, 0,952 (teclado de 47 teclas con letras, antes no encontrado) y 0,887. Los videos con manos y chispas sobre el teclado dan lecturas malas (F1 0,05 y menos): el lector ahora las marca como no confirmadas (teclas y barras deben coincidir con F1 ≥ 0,4) y solo una lectura confirmada podría usarse sin ByteDance. En un teclado de 40 teclas la octava salió corrida dos octavas (F1 0,02; con +24, 0,47): se añadió un estimador de octava con el sonido, que se aplica solo si el teclado no es de tamaño estándar y el margen llega a 0,3. Quedan sin leer el piano filmado y dos videos con teclado cubierto por manos.

Sin verificar: el estimador con audio real y la lectura descartada de un teclado de 55 teclas. El ADR sigue en **Propuesta** hasta ver una tercera corrida con esos dos puntos.

### Tercera medición (2026-11-26)

Con el PR 37 en la VPS: **8 de 10 leídos, 5 confirmados**. Las confirmadas son todas tutoriales con teclas iluminadas (F1 alineado contra ByteDance 0,978, 0,958, 0,952, 0,887 y 0,470 en el de 40 teclas). Ninguna de las 3 sin confirmar (cover con teclado dibujado de 83 teclas, video con manos y chispas, tutorial de 55 teclas) se usaría. El estimador de octava con audio real acertó en los 6 teclados donde corrió: 0 donde el teclado ya estaba bien y +24 en el de 40 teclas (F1 de 0,020 a 0,470). El piano filmado y la pieza clásica en perspectiva siguen sin leerse. Pendiente: entender el recall bajo (0,32) del teclado de 40 teclas y las teclas perdidas del de 55. El ADR sigue en **Propuesta** hasta que Kevin decida el alcance.

## Costo medido

- **En la VPS** (Ampere A1, 10 canciones reales de 2 a 4 min): leer el video tardó de 6,7 a 16,2 s por canción (mediana **12,9 s**) con 134–177 MB. ByteDance tardó de 239 a 550 s (mediana **413 s**) con 1,4–1,6 GB: leer la imagen es unas 30 veces más rápido y usa una décima parte de la memoria.
- Prototipo, x86 y un núcleo por proceso, con videos sintéticos: un 8 % de la duración del video en 480p a 30 fps con unos 150 MB; en 720p a 60 fps, un 18–24 % y 440 MB.
- Descarga: el video de 480p pesó de 0,8 a 8,1 MB por canción, por el proxy de casa.

## Alternativas consideradas

- **Darle fotogramas a un modelo de visión cada 5 s** (la primera idea): caro, con una resolución de 5 s en el tiempo, sin duraciones exactas y poco fiable.
- **Leer el video en el navegador**: el reproductor de YouTube es un iframe de otro origen y no deja leer sus píxeles; capturar la pestaña pide permiso de pantalla y obliga a reproducir la canción entera.
- **Seguir solo con el audio**: más simple, pero el modo con retroceso queda tan fiable como ByteDance.

## Consecuencias

- Notas, duraciones y manos exactas en los videos con notas que caen (la mayoría de los tutoriales), mejor partitura y retrocesos justos.
- **No arregla la detección por micrófono**: esto mejora la hoja de respuestas, no lo que se oye del teclado del usuario.
- Más descarga por canción y la misma exposición legal que el audio (ADR 0004). Videos con manos reales, cámaras en movimiento o efectos que tapan el teclado siguen con ByteDance.
- **Medido con pocos videos reales**: 10 canciones, 4 leídas. Desde el entorno de desarrollo no se llega a YouTube; los números reales salen de la VPS.
