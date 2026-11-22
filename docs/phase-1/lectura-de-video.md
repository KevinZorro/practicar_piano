# Lectura de las notas que caen del video (prototipo del ADR 0023)

Ver el ADR [0023](../adr/0023-transcripcion-leyendo-las-notas-del-video.md), que sigue en **Propuesta**. Este prototipo es un comando aparte (`notacaida videonotes run`): todavía no entra en la app ni cambia cómo se transcribe una canción.

**Medido solo con videos sintéticos.** Falta medirlo con tutoriales reales de YouTube y en la VPS (ARM64): ver «Cómo correrlo en la VPS».

## Qué hace

Visión clásica, sin IA: solo numpy y ffmpeg, que ya están en la imagen. Por cada video:

1. **Fondo.** La mediana, píxel a píxel, de 32 fotogramas clave repartidos por el video. Las barras se mueven y las teclas solo se iluminan mientras suenan, así que queda el teclado sin nada encima.
2. **Teclado.** En el fondo se buscan las teclas blancas (franjas claras separadas por rayas finas a paso regular) y, encima, las negras. Qué separaciones llevan tecla negra da el nombre de cada tecla (en cada octava: Do|Re, Re|Mi, nada, Fa|Sol, Sol|La, La|Si, nada). La octava sale del tamaño del teclado (88, 76, 61, 49 o 37 teclas) o, si no es estándar, de centrarlo en el Do central.
3. **Calibración**, con 4 s seguidos de video: el umbral de color que separa una barra del fondo (Otsu), la línea donde las barras se detienen y la velocidad de caída (el desplazamiento que lleva las barras de un fotograma al siguiente).
4. **Una pasada por todos los fotogramas**, recortados por ffmpeg a las filas que importan, sin tener nunca el video entero en memoria:
   - **barras**: la franja justo encima del teclado se desenrolla en una línea de tiempo más fina que un fotograma, porque la fila que está a *d* píxeles de la línea muestra lo que llega *d / velocidad* segundos después;
   - **teclas iluminadas**: una tecla suena mientras su superficie difiere del fondo.
5. **Notas.** Tramos cubiertos por una barra o tramos con la tecla iluminada. La lectura **teclas + barras** usa las teclas para decidir qué notas existen y las barras para su inicio y final; así separa repeticiones rápidas de la misma tecla y descarta brillos que no son notas. Si el video no ilumina las teclas, se usan solo las barras. Si las barras vienen en dos colores, el color da la mano.

Si el video no tiene un teclado dibujado (un piano filmado, por ejemplo) o no caen barras, no se lee, el informe dice por qué y no se corren los modelos de audio para esa canción.

Código: `backend/src/notacaida/infrastructure/{keyboard_detector,falling_notes_reader,ffmpeg_video}.py`, el nombre de las teclas en `domain/keyboard.py` y la comparación en `domain/agreement.py` y `application/video_benchmark.py`.

## Resultados con videos sintéticos (2026-11-22)

21 videos con sus notas verdaderas: 7 estilos genéricos por 3 piezas generadas en código. Las piezas son la «Oda a la alegría» (dominio público) con bajo, una de estrés (las 88 teclas seguidas, la misma tecla repetida con huecos de 20 ms, trinos de blancas y negras, clusters de semitonos y un acorde de 10 notas) y 75 s de pop aleatorio. Los estilos imitan lo que cambia entre tutoriales sin copiar ninguno: clásico; sin teclas iluminadas y con líneas de carril; barras juntas sin borde; neón con brillo y chispas; 61 teclas de un solo color; 360p muy comprimido; 720p a 60 fps.

| Estilo | Lectura | F1 contra la verdad | F1 solo barras | Desfase | Tiempo / duración | Memoria |
| --- | --- | --- | --- | --- | --- | --- |
| clásico | teclas + barras | 1,000 | 0,997–1,000 | +6 ms | 0,055–0,090 | 132–155 MB |
| sin teclas iluminadas | barras | 0,997–1,000 | igual | +6 ms | 0,052–0,092 | 133–155 MB |
| barras juntas | teclas + barras | 1,000 | 0,82–0,87 | +2 ms | 0,058–0,085 | 133–155 MB |
| neón | teclas + barras | 1,000 | 0,98–0,99 | +2 a +4 ms | 0,063–0,085 | 133–155 MB |
| 61 teclas, un color | teclas + barras | 1,000 | 0,997–1,000 | +8 ms | 0,058–0,080 | 133–156 MB |
| 360p comprimido | teclas + barras | 1,000 | 1,000 | +8 ms | 0,039–0,061 | 103–127 MB |
| 720p, 60 fps | teclas + barras | 1,000 | 1,000 | +3 a +4 ms | 0,178–0,243 | 437–445 MB |

- **21 de 21 leídos.** F1 (misma tecla e inicio a ±50 ms, sin descontar el desfase) contra las notas verdaderas: mediana **1,000**, peor **0,997**; exigiendo también el final de cada nota, peor 0,970.
- **Manos**: en 17 de los 18 videos con dos colores, el 99–100 % de las notas llevan la mano correcta; en el otro no se distinguieron y quedan sin mano. Con un solo color no se adivina.
- **Teclados**: los 5 tamaños estándar se nombran bien (pruebas unitarias) y cada tecla cae a menos de 1,5 px de donde está dibujada.
- **Costo**, en x86 y un núcleo por proceso: leer el video toma un 8 % de lo que dura en 480p a 30 fps (unos 19 s para una canción de 4 min) y unos 150 MB. En 720p a 60 fps, un 18–24 % y unos 440 MB; por eso se baja en 480p. En el Ampere A1 se espera más lento, **sin medir**. Como referencia, ByteDance tarda unos 6 min por canción en la VPS.
- **Contra el audio**: Basic Pitch transcribiendo el sonido de esos mismos videos (un sintetizador aditivo, no un piano real) llega a F1 0,77 de mediana contra la verdad. Con videos reales la referencia será ByteDance, que también se equivoca: ahí un F1 alto dice que ambos leen la misma canción, y donde difieren hay que oír cuál acierta.

Lo que enseñan los estilos:

- **Solo con barras**, cuando las barras de las teclas blancas son tan anchas como la tecla y no dejan hueco ni borde, tapan también media columna de la tecla negra vecina y aparecen notas negras que no existen: F1 de 0,82 a 0,87. Con las teclas iluminadas se descartan: F1 1,000. Un video así sin teclas iluminadas se leería mal.
- **El brillo** alrededor de las barras blancas hace lo mismo en pequeño: notas negras cortas que no existen (0,98–0,99 solo con barras). Las teclas iluminadas las descartan; las chispas no molestan.
- **El desfase** que queda (de +2 a +8 ms) viene del borde oscuro de las barras, más tenue que el umbral. El informe lo mide contra el audio y lo descuenta.

## Lo que todavía no sabe hacer

- Videos en los que el teclado se mueve, cambia de tamaño o queda tapado buena parte del tiempo (cámara, zoom, superposiciones).
- Teclados en perspectiva, notas que suben en lugar de caer o barras con degradados muy marcados: no hay ninguno entre los sintéticos.
- La octava de un teclado de tamaño no estándar puede salir corrida. El informe lo detecta contra el audio (columna «Transposición»), pero el lector no se corrige solo.
- La duración en videos donde la barra se oculta antes de terminar la nota.
- Supone fotogramas a ritmo constante, que es lo que sirve YouTube.

## Cómo correrlo en la VPS

Desde `~/practicar_piano`, con la rama ya fusionada en `main`:

```bash
bash infra/deploy.sh                     # baja main y reconstruye la imagen
export HOST_UID=$(id -u) HOST_GID=$(id -g)
mkdir -p phase0-output
docker compose -f infra/docker-compose.yml run --rm phase0 \
  videonotes run --links /data/links.txt --out /data/out/videonotes --models bytedance
```

- Usa el mismo `links.txt` de la Fase 0 (una canción por línea, `Título | enlace`) y el proxy de casa si está en `infra/.env`. Si pocas de esas canciones son tutoriales con notas que caen, agrega 5–10 que sí lo sean en `links-video.txt` (git lo ignora) y antepón `PHASE0_LINKS=../links-video.txt` al comando.
- Con ByteDance tarda unos 7 min por canción. Para una primera pasada rápida (solo leer los videos: cuáles se leen, tiempo y memoria en la VPS), quita `--models bytedance` y pon `--models` sin nada.
- El resultado queda en `phase0-output/videonotes/`: `report.md`, `results.json` y una carpeta por canción con `video.mid`, `video.wav`, `bytedance.mid`, `bytedance.wav`, `keyboard.png` (lo detectado sobre el fondo) y `roll.png` (las dos transcripciones superpuestas). El video y el audio se borran al terminar cada canción, y el informe no contiene enlaces.

Qué mirar: en `report.md`, cuántos videos se leyeron, el F1 alineado contra ByteDance y el tiempo y la memoria de «Lectura del video». En dos o tres canciones, `video.wav` frente a `bytedance.wav`: suenan con el mismo sintetizador, así que la diferencia es de notas, no de sonido.

## Reproducirlo sin red

Desde `backend/`, con los extras `synth` y `basic-pitch`:

```bash
uv run python -m tests.synthetic_videos --out ../synthetic-videos
uv run notacaida videonotes run --video-dir ../synthetic-videos --out ../videonotes-synthetic --models basic-pitch
```

`--video-dir` lee también videos que ya tengas: si junto a `cancion.mp4` hay un `cancion.mid`, se usa como la verdad. Las pruebas (`tests/unit/test_falling_notes_reader.py` dibuja los fotogramas en memoria; `tests/integration/test_video_reading.py` usa ffmpeg de verdad) cubren lo mismo en pequeño.
