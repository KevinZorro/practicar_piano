# Entrada por micrófono: mediciones

Ver el ADR [0020](../adr/0020-entrada-por-microfono.md). **Todo lo de esta página está medido con un piano y una sala simulados** (piano aditivo de tres cuerdas con parciales ligeramente inarmónicos, ruido rosado, zumbido de 100 Hz, altavoz sin graves, teclado desafinado, golpes de puerta y una voz que se desliza). El código del simulador está en `frontend/src/core/audio/testing/`. **Falta probarlo con el Vangoa VGK6101 real** (ver «Cómo comprobarlo con tu teclado»).

Reproducir (unos 2,5 min): `cd frontend && MIC_EVAL=/tmp/informe.md npx vitest run src/core/audio/micEval.test.ts`.

## Resultados (FFT 8192 a 48 kHz, 61 teclas: Do2 a Do7)

| Prueba                                                                                                                  | Resultado                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Nota esperada sola, 21 alturas × 4 condiciones (sala silenciosa, sala con ruido, altavoz sin graves, teclado +25 cents) | 100 % oídas (84/84)                                                                       |
| Acordes completos (tríadas, de 3 y 5 notas, quintas con octava; 5 raíces × 4 condiciones)                               | 90 % (72/80)                                                                              |
| Latencia del detector, del golpe a la decisión                                                                          | 151 ms (mediana y p95)                                                                    |
| Notas incorrectas inventadas al tocar bien                                                                              | 0 de 164 pasadas                                                                          |
| Se toca **otra** nota (14 intervalos × 5 alturas) y se acepta la esperada                                               | **0 de 70**                                                                               |
| Se toca otra nota y se la detecta como incorrecta                                                                       | 64 de 70 (91 %); falla sobre todo en graves, donde la etiqueta puede salir en otra altura |
| Ruido sin tocar (puerta, voz que se desliza, zumbido), 60 s                                                             | 0–1 aciertos falsos y 1–2 notas incorrectas falsas por minuto                             |
| Dueto en octava esperado, tocando solo la grave                                                                         | se acreditan **ambas** (límite conocido)                                                  |

Lectura honesta:

- **Falsos positivos de acierto** (dar por buena una nota que no era): 0 de 70 sustituciones y 0–1 por minuto con ruido. Esta es la métrica que Kevin priorizó, y los umbrales se fijaron para ella.
- **Lo que se paga** por esa prudencia: el 10 % de los acordes no se confirma a la primera (casi siempre una nota grave de un acorde denso) y hay que volver a tocarlo; en modo espera la canción simplemente sigue esperando.
- **Notas incorrectas falsas**: las que quedan vienen de una voz que arranca de golpe o un golpe seco. Con «Retroceder al fallar» activado, una de ellas retrocedería 5 s; por eso la casilla se puede apagar.
- La **latencia** es la del algoritmo (la ventana de 170 ms necesita ver el ataque). En Chromium real, con un micrófono falso y la grabación simulada, el mensaje llegó 0,14–0,18 s después del golpe (`ageS`), de acuerdo con la simulación.

## Qué hizo falta para llegar aquí (falsos positivos encontrados y eliminados)

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
2. **Calibrar con Do central**: 1 s de silencio y cinco clics; toca el Do central (C4) al oír cada clic. Verás retraso, afinación y avisos (ruido, Do bajito, golpes dispares).
3. Prueba en modo espera con la mano derecha: toca bien (debe avanzar), toca una nota vecina (no debe avanzar) y no toques nada con la tele de fondo (no debe avanzar).
4. Si algo falla, anota la canción, el tipo de fallo y la distancia del micrófono: con eso se ajustan los umbrales (`DEFAULT_OPTIONS` en `noteDetector.ts`).
