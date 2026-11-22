# Entrada por micrófono: mediciones

Ver el ADR [0020](../adr/0020-entrada-por-microfono.md). Hay dos mediciones, las dos **sin el teclado real**:

- **Con notas de piano grabadas** (desde el 2026-11-22, la que manda): tres pianos libres pasados por altavoz, sala y micrófono simulados. Es la que reproduce el fallo que Kevin vio con su Vangoa.
- **Con el piano simulado** (la original): piano aditivo, sala, ruido, una voz y golpes. Sigue sirviendo para el ruido y corre en cada PR, pero no ve los fallos de graves y agudos.

**Falta probarlo con el Vangoa VGK6101 real** (ver «Cómo comprobarlo con tu teclado»).

## Con notas de piano grabadas (2026-11-22)

Kevin probó con su teclado: no se oían bien las notas por debajo de Do3 ni por encima de Sol5, y así no podía practicar ninguna canción. El piano simulado no lo reproducía porque sus armónicos bajan como 1/h. Un grave real tiene la fundamental débil (en dos de los tres pianos grabados, la del Do2 está 10–27 dB por debajo del 2.º armónico) y un agudo real casi solo tiene la fundamental (Sol6: el 2.º armónico, 24–28 dB más bajo; Do7: el 3.º, 32–63 dB).

- **Notas**: Do2 a Do7 de tres pianos libres, FluidR3_GM y MusyngKite (renderizados por gleitz/midi-js-soundfonts) y Salamander Grand Piano V3 (CC BY 3.0, una nota cada tres semitonos). Se descargan aparte; no se versionan ni forman parte de la app.
- **Cadenas** (`frontend/src/core/audio/testing/chain.ts`): «cable» (de la salida de audífonos a la entrada de micrófono), «altavoz + micro» (altavoces pequeños, sala de 0,4 s y micrófono de portátil), «altavoz + micro + ruido» y «altavoz diminuto + micro lejos».
- **Niveles**: el pico del Do4 de cada piano en 0,15 (fuerte), 0,04 (normal) y 0,015 (bajito).

Reproducir (unos 10 min; necesita ffmpeg y red):

```bash
cd frontend
scripts/fetch-piano-samples.sh .piano-samples
MIC_SAMPLES=.piano-samples MIC_SAMPLES_OUT=/tmp/informe.md npx vitest run src/core/audio/samplesEval.test.ts
```

`MIC_DETAIL=1` lista cada fallo y `MIC_SECTIONS` elige las secciones (`singles,subst,chords,lines,linesubst`).

### Antes y después, nivel normal

| Prueba | Antes, cable | Antes, altavoz + micro | Ahora, cable | Ahora, altavoz + micro |
| --- | --- | --- | --- | --- |
| Nota sola, Do2–Si2 | 28/28 | 25/28, y 3 con su octava marcada como incorrecta | 28/28 | 28/28 |
| Nota sola, Do3–Fa#5 | 73/73 | 73/73 | 73/73 | 73/73 |
| Nota sola, Sol5–Si5 | 10/11 | 10/11 | 11/11 | 11/11 |
| Nota sola, Do6–Do7 | 13/31 | 16/31 | 31/31 | 31/31 |
| Acordes completos (5 formas, raíces de Do2 a Do6) | 105/133, 4 con nota inventada | 108/133, 2 con nota inventada | 133/133, ninguno con nota inventada | 133/133, ninguno con nota inventada |
| Bajo: nota nueva con la anterior sonando | 3/17, 5 con nota inventada | 4/17, 1 con nota inventada | 16/17, ninguno con nota inventada | 16/17, ninguno con nota inventada |
| Agudos: nota nueva con la anterior sonando | 7/13 | 8/13 | 13/13 | 13/13 |
| Otra tecla en lugar de la esperada: **se acepta** (error grave) | 1/382 | 0/382 | 3/382 | 1/382 |
| Otra tecla con la anterior sonando: **se acepta** | sin medir | sin medir | 1/159 | 1/159 |

Notas sueltas en todas las cadenas y volúmenes (143 notas por casilla; entre paréntesis, las veces que además se inventó una nota incorrecta):

| Cadena | Fuerte, antes | Fuerte, ahora | Normal, antes | Normal, ahora | Bajito, antes | Bajito, ahora |
| --- | --- | --- | --- | --- | --- | --- |
| cable | 128 (2) | 141 | 124 | 143 | 112 | 142 |
| altavoz + micro | 126 (4) | 138 | 124 | 143 | 114 | 140 |
| altavoz + micro + ruido | sin medir | 143 | sin medir | 140 | sin medir | 122 |
| altavoz diminuto + micro lejos | 123 (7) | 142 | 118 | 141 | 102 (1) | 127 |

Lectura honesta:

- Las notas sueltas, los acordes y el bajo con la nota anterior sonando pasan de fallar a funcionar en las dos cadenas, **sin inventar notas incorrectas** al tocar bien (0 en todas las pruebas de esta tabla).
- Los aceptados por error que quedan son casi todos octavas: tocar la octava de arriba de la nota grave esperada con notas de MusyngKite, que traen una copia débil de la octava de abajo, más un caso de FluidR3 con una quinta (3 de 382 con cable, 1 de 382 con altavoz; antes 1 y 0, porque entonces los graves casi no se oían). Una octava equivocada es el error más leve; en «Retroceso automático» significa que no retrocede.
- Con poco volumen y ruido, o con un altavoz diminuto lejos del micrófono, se pierden algunas notas (no se inventan): conviene acercar el micrófono o subir el volumen.

### Qué fallaba y qué se cambió

1. **La octava de arriba se quedaba con los graves.** Los armónicos pares de un grave sin fundamental parecían su octava, que ganaba y además se marcaba como incorrecta (en «Retroceso automático», un retroceso injusto). Ahora la octava o la duodécima de arriba no puede quitarle el sitio a una nota cuyos armónicos impares suenan, y nunca se declara incorrecta por eso.
2. **Fuga espectral en graves.** Por debajo de unos 300 Hz un bin abarca más de un semitono; la fuga de un armónico fuerte hacía pasar por presentes a las notas vecinas, con el mismo puntaje. Ahora un armónico cuenta solo si es un pico de verdad (no la ladera de otro) y los rivales se comparan con las ventanas donde se busca cada armónico.
3. **La estabilidad del tono** (±20 cents) se medía con todos los armónicos; los graves, que no separan semitonos, la llenaban de ruido. Ahora usa los que sí los separan.
4. **Por debajo de Do2** (teclados de 76 u 88 teclas): tocar Sol1 se aceptaba como Sol2. Ahora también compiten como rivales las notas hasta Do1.
5. **Agudos.** Se exigía la mitad de los armónicos (mínimo 3) bajo 4,5 kHz, y una nota aguda real no los tiene. Ahora basta la fundamental clara más otro armónico, y desde Fa6 una fundamental fuerte y estable sola (≥ 20 dB sobre el fondo y 15 dB de prominencia).
6. **Nota nueva con la anterior sonando** (bajo con pedal). La subida sobre lo de hace 250 ms y la prominencia se medían a ±3–4 bins, y en graves ahí están los armónicos de la nota anterior: la nueva parecía no subir. Ahora las dos medidas se detienen en el valle antes de otro pico, y los armónicos que la nota comparte con la que ya sonaba en el mismo sitio no cuentan ni a favor ni en contra (siempre con al menos tres propios; las notas incorrectas siguen contando todos).
7. **Tocar la octava de abajo.** Su puntaje podía quedar por debajo del de la esperada (que mira armónicos más altos) y la esperada pasaba. Ahora la octava de abajo gana cuando sus propios armónicos impares suenan casi tan fuertes como los compartidos (hasta 12 dB menos: algunas notas grabadas traen una copia débil de la octava de abajo, y la que de verdad se tocó no debe perder por eso).

La voz que se desliza obligó a ajustar el punto 6: con la vecindad recortada sin más, inventaba de 2 a 8 notas por minuto; deteniéndola en los valles vuelve a los valores de antes (tabla del piano simulado).

### Lo que sigue fallando

- **Octava hacia arriba con la de abajo sonando** (Do2 y luego Do3): todos los armónicos de la aguda ya estaban sonando; si la aguda suena floja no queda nada propio que oír (1 de 17 en la tabla).
- **Octavas y muestras raras**: en dos de los pianos grabados, algunas notas traen componentes de la octava de abajo o de una quinta (resonancias de la muestra); ahí tocar una tecla puede dar por buena otra. Un teclado digital también reproduce muestras, así que puede pasar con el Vangoa.
- **Una voz que canta cerca de la nota esperada**: hasta 2 aciertos falsos por minuto mientras se espera un acorde (antes, 1).

## Con el piano simulado

Piano aditivo de tres cuerdas con parciales ligeramente inarmónicos (desde el 2026-11-22, con fundamental débil en graves y armónicos que caen en agudos, como los pianos grabados), ruido rosado, zumbido, altavoz sin graves, teclado desafinado, golpes de puerta y una voz que se desliza. El código está en `frontend/src/core/audio/testing/`.

Reproducir (unos 3 min): `cd frontend && MIC_EVAL=/tmp/informe.md npx vitest run src/core/audio/micEval.test.ts`.

### Resultados (FFT 8192 a 48 kHz, 61 teclas: Do2 a Do7)

| Prueba | Antes (2026-11-17) | Ahora (2026-11-22) |
| --- | --- | --- |
| Nota esperada sola, 21 alturas × 4 condiciones (sala silenciosa, sala con ruido, altavoz sin graves, teclado +25 cents) | 100 % (84/84) | 100 % (84/84) |
| Acordes completos (tríadas, de 3 y 5 notas, quintas con octava; 5 raíces × 4 condiciones) | 90 % (72/80) | 100 % (80/80) |
| Latencia del detector, del golpe a la decisión | 151 ms (mediana y p95) | 151 ms |
| Notas incorrectas inventadas al tocar bien | 0 de 164 pasadas | 0 de 164 |
| Se toca **otra** nota (14 intervalos × 5 alturas) y se acepta la esperada | **0 de 70** | **0 de 70** |
| Se toca otra nota y se la detecta como incorrecta | 64 de 70 (91 %) | 65 de 70 (93 %) |
| Ruido sin tocar (puerta, voz que se desliza, zumbido), 60 s | 0–1 aciertos falsos y 1–2 notas incorrectas falsas por minuto | 0–2 aciertos falsos y 1–2 notas incorrectas falsas por minuto |
| Dueto en octava esperado, tocando solo la grave | se acreditan **ambas** (límite conocido) | igual |

Lectura honesta:

- **Falsos positivos de acierto** (dar por buena una nota que no era): 0 de 70 sustituciones y 0–2 por minuto con ruido. Esta es la métrica que Kevin priorizó, y los umbrales se fijaron para ella.
- **Notas incorrectas falsas**: las que quedan vienen de una voz que arranca de golpe o un golpe seco. Con «Retroceder al fallar» activado, una de ellas retrocedería; por eso la casilla se puede apagar.
- La **latencia** es la del algoritmo (la ventana de 170 ms necesita ver el ataque). En Chromium real, con un micrófono falso y la grabación simulada, el mensaje llegó 0,14–0,18 s después del golpe (`ageS`), de acuerdo con la simulación.

### Qué hizo falta para llegar aquí (falsos positivos encontrados y eliminados)

1. Una nota fuerte en sala silenciosa «sube» todos los bins vecinos por fuga espectral → se exige que el pico **destaque** de lo que tiene a 4 bins.
2. El fondo seguía a la nota en milisegundos y la dejaba de «oír» → el fondo sube como máximo 10 dB/s.
3. Los armónicos pares de una nota parecían la octava inferior → se exigen armónicos impares.
4. En graves, los armónicos de otra nota coinciden por casualidad con los de la esperada (Mi2 por Sol2) → cancelación voraz y comprobación de rivales.
5. La voz que se desliza y el zumbido → el armónico debe subir también sobre lo que había 250 ms antes y mantener el tono (±20 cents).
6. FFT de 4096 (85 ms): aceptaba una nota esperada tocando un semitono más abajo → descartada.

## Límites que no se pueden resolver con un micrófono

- **Octavas esperadas juntas** (mano izquierda): la aguda no añade energía propia; se acreditan ambas con que suene la grave.
- Una voz o un silbido que imite el tono esperado de forma estable puede pasar.
- Por debajo de Do2 y por encima de Do7 no hay garantías.
- Habitación con reverberación fuerte o varios instrumentos: no medido.

## Cómo comprobarlo con tu teclado

1. Abre la práctica, pulsa **Usar micrófono** y acepta el permiso. Sin audífonos, la app se queda en silencio a propósito (el vídeo y el sonido de la app se apagan); con audífonos, marca la casilla.
2. **Calibrar con Do central**: 1 s de silencio y cinco clics; toca el Do central (C4) al oír cada clic. Verás retraso, afinación y avisos (ruido, Do bajito, golpes dispares). Si ya tenías una calibración, repítela.
3. Prueba en modo espera: toca bien (debe avanzar), toca una nota vecina (no debe avanzar) y no toques nada con la tele de fondo (no debe avanzar).
4. Prueba los extremos, que es lo que se arregló: notas sueltas en Do2–Si2 y en Do6–Do7, y una línea de bajo con pedal (cada nota mientras la anterior sigue sonando).
5. Si algo falla, anota la canción, la nota, el tipo de fallo y la distancia del micrófono: con eso se ajustan los umbrales (`DEFAULT_OPTIONS` y las constantes de `noteDetector.ts`).
