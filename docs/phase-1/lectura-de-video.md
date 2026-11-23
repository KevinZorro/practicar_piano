# Lectura de las notas que caen del video (prototipo del ADR 0023)

Ver el ADR [0023](../adr/0023-transcripcion-leyendo-las-notas-del-video.md), que sigue en **Propuesta**. Este prototipo es un comando aparte (`notacaida videonotes run`): todavía no entra en la app ni cambia cómo se transcribe una canción.

**Medido con videos sintéticos y con 10 canciones reales en la VPS, dos veces** (2026-11-22, ver «Resultados con canciones reales»). En los tutoriales con teclas iluminadas coincide con ByteDance (F1 0,89–0,98) en unos 10 s en vez de unos 5 min; en los videos con manos reales sobre un teclado dibujado y en el piano filmado no sirve, y el sistema lo sabe (una lectura solo se da por buena si dos lecturas independientes coinciden).

## Qué hace

Visión clásica, sin IA: solo numpy y ffmpeg, que ya están en la imagen. Por cada video:

1. **Fondo.** La mediana, píxel a píxel, de 32 fotogramas clave repartidos por el video. Las barras se mueven y las teclas solo se iluminan mientras suenan, así que queda el teclado sin nada encima.
2. **Teclado.** En el fondo se buscan las teclas blancas (franjas claras separadas por rayas finas a paso regular) y, encima, las negras. Qué separaciones llevan tecla negra da el nombre de cada tecla (en cada octava: Do|Re, Re|Mi, nada, Fa|Sol, Sol|La, La|Si, nada). La octava sale del tamaño del teclado (88, 76, 61, 49 o 37 teclas) o, si no es estándar, de centrarlo en el Do central (una suposición: el informe la marca). Si las letras impresas en las teclas parten las blancas en dos franjas, se prueba con la siguiente. Una iluminación que se apaga hacia un extremo o un video oscuro no impiden encontrar las teclas del borde. Si no hay teclado, el informe dice qué paso falló.
3. **Calibración**, con 4 s seguidos de video: el umbral de color que separa una barra del fondo (Otsu), la línea donde las barras se detienen y la velocidad de caída (el desplazamiento que lleva las barras de un fotograma al siguiente).
4. **Una pasada por todos los fotogramas**, recortados por ffmpeg a las filas que importan, sin tener nunca el video entero en memoria:
   - **teclas iluminadas**: una tecla suena mientras su superficie difiere del fondo;
   - **barras**: la franja justo encima del teclado se desenrolla en una línea de tiempo más fina que un fotograma, porque la fila que está a *d* píxeles de la línea muestra lo que llega *d / velocidad* segundos después.
5. **Notas.** Si el video ilumina las teclas, la lectura son sus tramos iluminados, con inicio y final a un fotograma (33 ms a 30 fps). Si no las ilumina, son los tramos cubiertos por una barra. Si las barras vienen en dos colores, el color da la mano: a cada nota iluminada le toca la de la barra que cae sobre su tecla en ese momento, una vez descontado el desfase entre barras y teclas, que se mide en cada video.

6. **Octava, con el sonido.** Si el teclado no es de tamaño estándar, la octava es una suposición y puede salir corrida dos octavas (pasó en un tutorial de 40 teclas). El audio la decide sin modelo: una nota que de verdad suena a la frecuencia *f* tiene energía en *f* y casi nada en *f*/2; leída una octava arriba, la nota real queda a la mitad y hay tanta energía debajo como encima; leída una octava abajo, no hay energía en su frecuencia. Para cada desplazamiento posible (−24, −12, 0, +12, +24 semitonos, sin salirse del piano) se puntúa cada nota por cuánto más fuerte es su frecuencia que la mitad de ella, y gana el mejor promedio de la canción. Solo se aplica si el teclado era una suposición y el margen sobre el segundo es de al menos 0,3. En un teclado estándar se mide pero no se toca, para poder juzgar el método. Código: `infrastructure/octave_check.py`.

Las teclas iluminadas cuentan si se iluminan como notas: al menos 8 tramos y, mientras alguna está iluminada, no más de 8 a la vez (una mano sobre un piano filmado o un logo cambia muchas). Si además coinciden con las barras (F1 de al menos 0,4 al descontar el desfase), quedan **confirmadas**; en los tutoriales reales medidos esa coincidencia es de 0,55–0,69, y en los dos videos cuyas teclas no eran notas fue de 0,02 y 0,23. Si no coinciden, cuentan igual cuando son al menos 20, al menos la mitad de las notas de las barras (un logo sobre el teclado de un video sin teclas iluminadas no es una nota) y como mucho el triple (un video cuyas teclas parpadean 12 veces más que las barras que llegan no ilumina notas). Lo que se descarta se mide igual y el informe lo muestra como `(descartada)`.

**Qué puede usar la app sin ByteDance:** solo una lectura confirmada (dos lecturas independientes de las mismas notas) y, si el teclado no era estándar, con la octava oída en el sonido. Todo lo demás debe caer a la transcripción del audio.

Si el video no tiene un teclado dibujado (un piano filmado, por ejemplo) o no caen barras, no se lee, el informe dice por qué y no se corren los modelos de audio para esa canción.

Código: `backend/src/notacaida/infrastructure/{keyboard_detector,falling_notes_reader,ffmpeg_video}.py`, el nombre de las teclas en `domain/keyboard.py` y la comparación en `domain/agreement.py` y `application/video_benchmark.py`.

## Resultados con canciones reales (VPS, 2026-11-22)

Kevin corrió el comando en la VPS (Ampere A1, 2 OCPU, por el proxy de casa) con las 10 canciones de `links.txt`, contra ByteDance. No hay partitura verdadera: el F1 dice cuánto coinciden la lectura del video y la transcripción del audio, que también se equivoca. «Alineado» descuenta un desfase constante entre la imagen y el sonido.

| Canción | Teclado | Teclas iluminadas | F1 teclas | F1 barras | F1 teclas + barras (quitada) | Desfase de las teclas | Leer el video | ByteDance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tutorial, 88 teclas | 88, A0-C8 | sí | **0,978** | 0,539 | 0,629 | −73 ms | 10,2 s, 177 MB | 359 s, 1420 MB |
| tutorial, 61 teclas | 61, C2-C7 | sí | **0,958** | 0,648 | 0,921 | −13 ms | 16,2 s, 176 MB | 466 s, 1448 MB |
| tutorial, 88 teclas | 88, A0-C8 | sí | **0,887** | 0,513 | 0,847 | −91 ms | 6,7 s, 176 MB | 239 s, 1393 MB |
| pieza para piano con teclado dibujado | 87, A0-B7 | no | — | 0,033 | — | (barras +81 ms) | 15,6 s, 134 MB | 550 s, 1555 MB |
| 2 tutoriales | no se encontró | | | | | | | |
| 2 covers y 1 pieza clásica | no se encontró | | | | | | | |
| 1 tutorial | YouTube respondió 403 al bajar la imagen | | | | | | | |

- **Teclas iluminadas**: precisión 0,88–0,99 y recall 0,89–0,97 contra ByteDance. Leen la misma canción.
- **Barras**: inventan notas (2059 contra 895, 1124 contra 490; precisión 0,37–0,56) y llegan con un desfase frente a las teclas que cambia de un video a otro (+94, +56 y −20 ms). Por eso la lectura que tomaba de las barras el inicio de las notas quedó por debajo de las teclas solas en los tres videos, y se quitó.
- **F1 con finales** bajo en todos (0,03–0,47): exige que la nota termine a la vez, y con pedal el sonido sigue después de soltar la tecla. Para practicar importa el inicio.
- **Manos por color**: el 93 % y el 78 % de las notas leídas caen en la mano que da la división en Do central. No es una nota de acierto: esa división también se equivoca.
- **Costo**: leer el video, mediana 12,9 s por canción; ByteDance, mediana 413 s. Unas 30 veces más rápido y una décima parte de la memoria.

Con el cambio a las teclas iluminadas, la mediana de las 4 canciones leídas pasa de 0,738 a 0,92 (la lectura de las teclas no cambió). Queda sin entender el video sin teclas iluminadas y por qué no se encontró el teclado en 5: la siguiente corrida guarda `plate.png` y `frame.png` de cada canción y dice qué paso del detector falló.

## Segunda corrida real (VPS, 2026-11-22, con las imágenes de la primera)

Con la detección arreglada a partir de las imágenes de la primera corrida, Kevin volvió a medir las mismas 10 canciones (ByteDance reutilizado). Se leyeron **7 de 10**. Mediana de leer el video: 10,4 s y 178 MB; ByteDance, mediana 278 s.

| Canción | Teclado | F1 teclas | F1 barras | Qué pasó |
| --- | --- | --- | --- | --- |
| tutorial, 88 teclas | 88, A0-C8 | **0,978** | 0,54 | lectura confirmada |
| tutorial, 61 teclas | 61, C2-C7 | **0,958** | 0,65 | lectura confirmada |
| tutorial, 47 teclas con letras | 47, G2-F6 | **0,952** | | antes no se encontraba |
| tutorial, 88 teclas | 88, A0-C8 | **0,887** | 0,51 | lectura confirmada |
| video con manos y chispas sobre el teclado | 88, A0-C8 | 0,048 | 0,002 | las chispas y las manos iluminan 4320 notas contra 1982: se descarta |
| tutorial, 55 teclas | 55, B1-F6 | rechazada | 0,215 | las teclas iluminadas no coinciden con las barras |
| tutorial, 40 teclas | 40, E2-G5 | 0,020 | | teclas y barras coinciden (0,58), pero la octava salió corrida 2 octavas: con +24, 0,470 |
| 3 videos | | | | piano filmado (1) y teclado con manos encima (3 y 4) |

Lo que enseñan las imágenes: hay tres clases de video. Los tutoriales con teclado dibujado y teclas que se iluminan (funcionan); los videos con manos reales sobre un teclado dibujado y brillo o chispas (difíciles, el lector debe saber que no está seguro); y el piano filmado, que este método no lee.

Cambios que salieron de ahí: el detector acepta teclas más oscuras y una primera o última tecla algo más tenue que su vecina; la lectura de las teclas iluminadas se «confirma» solo si coincide con la de las barras (F1 ≥ 0,4); se miden también las lecturas descartadas; y la octava de un teclado no estándar se comprueba con el sonido (paso 6). Lo único que la app podría usar sin ByteDance es una lectura confirmada.

Sin verificar todavía en la VPS: el estimador de octava con audio real (se espera desplazamiento 0 en los tutoriales de tamaño estándar y +24 en el de 40 teclas) y el F1 real de la lectura descartada de la canción de 55 teclas.

## Resultados con videos sintéticos (2026-11-22)

24 videos con sus notas verdaderas: 8 estilos genéricos por 3 piezas generadas en código. Las piezas son la «Oda a la alegría» (dominio público) con bajo, una de estrés (las 88 teclas seguidas, la misma tecla repetida con huecos de 20 ms, trinos de blancas y negras, clusters de semitonos y un acorde de 10 notas) y 75 s de pop aleatorio. Los estilos imitan lo que cambia entre tutoriales sin copiar ninguno: clásico; sin teclas iluminadas y con líneas de carril; barras juntas sin borde; neón con brillo y chispas; 61 teclas de un solo color; 360p muy comprimido; 720p a 60 fps; letras impresas en las teclas blancas.

| Estilo | Lectura | F1 contra la verdad | F1 solo barras | Desfase | Tiempo / duración | Memoria |
| --- | --- | --- | --- | --- | --- | --- |
| clásico | teclas iluminadas | 0,995–1,000 | 0,998–1,000 | −17 a +4 ms | 0,048–0,065 | 133–155 MB |
| sin teclas iluminadas | barras | 0,998–1,000 | igual | +5 a +6 ms | 0,052–0,072 | 133–155 MB |
| barras juntas | teclas iluminadas | 0,995–1,000 | 0,82–0,87 | −17 a +4 ms | 0,046–0,094 | 133–155 MB |
| neón | teclas iluminadas | 0,995–1,000 | 0,98–0,99 | −17 a +4 ms | 0,061–0,072 | 133–155 MB |
| 61 teclas, un color | teclas iluminadas | 0,994–1,000 | 0,997–1,000 | −17 a +4 ms | 0,049–0,068 | 133–156 MB |
| 360p comprimido | teclas iluminadas | 0,995–1,000 | 1,000 | −17 a +4 ms | 0,032–0,059 | 103–127 MB |
| 720p, 60 fps | teclas iluminadas | 1,000 | 1,000 | −8 a +1 ms | 0,183–0,236 | 437–445 MB |
| letras en las teclas | teclas iluminadas | 0,995–1,000 | 0,998–1,000 | −17 a +4 ms | 0,039–0,071 | 133–155 MB |

- **24 de 24 leídos.** F1 (misma tecla e inicio a ±50 ms, sin descontar el desfase) contra las notas verdaderas: mediana **0,999**, peor **0,994**; exigiendo también el final de cada nota, peor 0,985. Lo que falta en la pieza de estrés es una repetición cuyo hueco de 20 ms cayó entre dos fotogramas: a 60 fps, 1,000.
- **El desfase** de las teclas iluminadas es de medio fotograma como mucho: una tecla se ilumina en el primer fotograma después de que empieza su nota, y la lectura pone el inicio entre ese fotograma y el anterior. En la «Oda», cuyas notas caen justo en un fotograma, eso da −17 ms; en una canción real los inicios caen en cualquier punto y se compensa.
- **Manos**: en 20 de los 21 videos con dos colores, el 99–100 % de las notas llevan la mano correcta; en el otro no se distinguieron y quedan sin mano. Con un solo color no se adivina.
- **Teclados**: los 5 tamaños estándar se nombran bien, también con letras impresas en las teclas o con la primera o la última tecla cortada por el borde de la imagen (pruebas unitarias), y cada tecla cae a menos de 1,5 px de donde está dibujada.
- **Costo**, en x86 y un núcleo por proceso: leer el video toma de un 3 a un 9 % de lo que dura en 480p a 30 fps y unos 150 MB; en 720p a 60 fps, un 18–24 % y unos 440 MB, por eso se baja en 480p.
- **Contra el audio**: Basic Pitch transcribiendo el sonido de estos videos (un sintetizador aditivo, no un piano real) llegó a F1 0,77 de mediana contra la verdad en la medición anterior.

Lo que enseñan los estilos:

- **Solo con barras**, cuando las barras de las teclas blancas son tan anchas como la tecla y no dejan hueco ni borde, tapan también media columna de la tecla negra vecina y aparecen notas negras que no existen: F1 de 0,82 a 0,87. El brillo alrededor de las barras hace lo mismo en pequeño (0,98–0,99). Con las teclas iluminadas no pasa: 0,995–1,000.
- **Las letras impresas** en las teclas parten las blancas en dos franjas; la de abajo no lleva teclas negras encima y el detector pasa a la siguiente.

## Lo que todavía no sabe hacer

- Encontrar el teclado en todos los tutoriales: en la VPS no lo encontró en 2 que, por el título, deberían tener notas que caen.
- Leer bien las barras de los tutoriales reales: con teclas iluminadas no hace falta; sin ellas, la única canción así salió mal.
- Separar dos repeticiones de la misma tecla cuyo hueco cae entre dos fotogramas: la tecla sigue iluminada y salen como una nota (más raro a 60 fps).
- Videos en los que el teclado se mueve, cambia de tamaño o queda tapado buena parte del tiempo (cámara, zoom, superposiciones).
- Teclados en perspectiva, notas que suben en lugar de caer o barras con degradados muy marcados: no hay ninguno entre los sintéticos.
- Videos con manos reales o chispas sobre el teclado dibujado, y piano filmado: el lector no los lee bien y lo dice (lectura sin confirmar).
- La octava de un teclado de tamaño no estándar se estima con el sonido; falta validarlo con audio real.
- Teclados en perspectiva: el extremo derecho más angosto (~8 %) puede dar una tecla de más.
- Supone fotogramas a ritmo constante, que es lo que sirve YouTube.

## Cómo correrlo en la VPS

Al fusionar en `main`, el despliegue automático deja la imagen nueva en la VPS (unos 30 s; no hace falta `infra/deploy.sh`). Desde `~/practicar_piano`:

```bash
export HOST_UID=$(id -u) HOST_GID=$(id -g)
nohup docker compose -f infra/docker-compose.yml run --rm -T phase0 \
  videonotes run --links /data/links.txt --out /data/out/videonotes --models bytedance \
  --reuse /data/out > videonotes.log 2>&1 &
tail -n 3 videonotes.log                    # repetir hasta que diga «Done. Report:»
cat phase0-output/videonotes/report.md
```

- Antes de correr: `docker compose -f infra/docker-compose.yml run --rm -T phase0 videonotes run --help < /dev/null | grep -c -- --reuse` debe dar 2. Si da 0, la imagen quedó con código viejo (uv reutiliza la rueda en caché del proyecto): el Dockerfile ahora reinstala el paquete; mientras tanto, monta el código con `-v "$PWD/backend/src:/src:ro" -e PYTHONPATH=/src`.
- `nohup … &` deja correr la medición aunque se cierre la sesión SSH.
- `--reuse /data/out` no vuelve a transcribir lo que ya se transcribió: toma el `bytedance.mid` de cada canción de una corrida anterior de esta medición (`phase0-output/videonotes/`) o de la Fase 0 (`phase0-output/`, que nombra las canciones igual). Como solo cambia el lector, volver a medir tarda unos minutos y no media hora. ByteDance corre solo en una canción que no tenga ninguno; `--reuse` sin carpeta mira solo en `--out`.
- Usa el mismo `links.txt` de la Fase 0 (una canción por línea, `Título | enlace`) y el proxy de casa si está en `infra/.env`. Para medir otros tutoriales, ponlos en `links-video.txt` (git lo ignora) y antepón `PHASE0_LINKS=../links-video.txt` al comando.
- Para solo leer los videos (cuáles se leen, tiempo y memoria), pon `--models` sin nada.
- El resultado queda en `phase0-output/videonotes/`: `report.md`, `results.json` y una carpeta por canción con `plate.png` (el fondo, donde se busca el teclado), `frame.png` (un fotograma de la mitad del video), `keyboard.png` (lo detectado sobre el fondo), `roll.png` (las dos transcripciones superpuestas), `video.mid`, `video.wav`, `bytedance.mid` y `bytedance.wav`. Las imágenes están aunque el video no se haya leído. El video y el audio se borran al terminar cada canción, y el informe no contiene enlaces.
- Si YouTube responde 403 al bajar la imagen, se intenta una vez más con el archivo de 360p que trae imagen y sonido.

Qué mirar: en `report.md`, cuántos videos se leyeron, el F1 alineado contra ByteDance y, en los no leídos, qué paso del detector falló. En las canciones que no se leyeron o salieron mal, `plate.png` y `frame.png` muestran qué vio el lector. En dos o tres canciones, `video.wav` frente a `bytedance.wav`: suenan con el mismo sintetizador, así que la diferencia es de notas, no de sonido.

## Reproducirlo sin red

Desde `backend/`, con los extras `synth` y `basic-pitch`:

```bash
uv run python -m tests.synthetic_videos --out ../synthetic-videos
uv run notacaida videonotes run --video-dir ../synthetic-videos --out ../videonotes-synthetic --models basic-pitch
```

`--video-dir` lee también videos que ya tengas: si junto a `cancion.mp4` hay un `cancion.mid`, se usa como la verdad. Las pruebas (`tests/unit/test_falling_notes_reader.py` dibuja los fotogramas en memoria; `tests/integration/test_video_reading.py` usa ffmpeg de verdad) cubren lo mismo en pequeño.
