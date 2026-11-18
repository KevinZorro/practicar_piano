# ADR 0020 — Entrada por micrófono como alternativa al teclado MIDI

Estado: **Propuesta** (pendiente del visto bueno de Kevin). Complementa el ADR 0008.

## Contexto

El teclado de Kevin (Vangoa VGK6101) no envía MIDI por USB, así que no puede usar el modo espera ni el puntaje (D-01 supone Web MIDI). Kevin acepta oír las notas con el micrófono, con tres condiciones: que se compruebe que suenan **las notas esperadas y no otras**, que **no haya falsos positivos** (mejor no dar por buena una nota dudosa) y que haya una **calibración inicial** (tocar Do central varias veces, como en otra app que probó). Esto cambia la arquitectura (una entrada nueva), de ahí este ADR.

## Decisión

1. **Puerto común de entrada** (`core/input/noteInput.ts`): `NoteInput` con `onNote`, estado y `stop`. El teclado MIDI y el micrófono lo implementan; la pantalla de práctica y el dominio (máquina del modo espera, `Judge`) no saben cuál hay detrás. Un mensaje puede traer `ageS` (cuánto hace que se pulsó la tecla): el MIDI entrega 0, el micrófono necesita ~150 ms para estar seguro.
2. **Verificar, no transcribir.** La app sabe qué notas se esperan, así que el detector (`core/audio/noteDetector.ts`, código puro sobre espectros en dB) pregunta «¿está esta nota?» y, por separado, «¿suena claramente otra?». Todo en el navegador (Web Audio `AnalyserNode`, FFT de 8192): el audio no se sube ni se guarda.
3. **Criterios conservadores** (cada uno nació de un falso positivo medido, ver `docs/phase-1/microfono-mediciones.md`):
   - un armónico cuenta solo si sube ≥ 12 dB sobre el fondo, **y** sobre lo que había 250 ms antes (los ataques son bruscos; voces y zumbidos no), **y** destaca de sus vecinos (si no, es fuga de una nota fuerte);
   - la nota necesita la mitad de sus armónicos (mínimo 3), con armónicos impares (distingue una nota de su octava inferior) y armónicos que separen semitonos;
   - cancelación voraz: lo que explica una nota presente no puede hacerse pasar por otra (sobretonos, coincidencias en graves);
   - una nota esperada se retira si una no esperada explica la mayor parte de sus armónicos;
   - el tono debe mantenerse estable (±20 cents) mientras se confirma: una voz que se desliza no es una nota;
   - una nota **incorrecta** exige umbrales aún más estrictos (≥ 16 dB, mayor prominencia, 70 ms de persistencia) y no se declara a ±1 semitono de una esperada.
4. **Calibración con Do central** (5 golpes con un clic): mide la **latencia** (clic a detección; se descuenta al juzgar el juego libre), el **ruido de fondo**, la **afinación** del teclado (se desplazan todas las frecuencias) y el **timbre** (qué armónicos suenan flojos: se baja su umbral hasta un mínimo de 9 dB, nunca más). Avisa si hay ruido, si el Do suena bajito o si los golpes no caen parejos con el clic (entonces se usa un retraso estándar). Se guarda en `localStorage`.
5. **El vídeo no puede oírse.** Si la app suena por los parlantes, el micrófono oye exactamente las notas esperadas y las daría por tocadas. Con micrófono, la app **silencia el vídeo y el sintetizador** (`PlayerPort.setMuted`) salvo que el usuario marque «Uso audífonos». Se desactivan `echoCancellation`, `noiseSuppression` y `autoGainControl` (deforman las notas). Tampoco se «repiten» con el sintetizador las teclas detectadas.

## Alternativas consideradas

- **Transcripción libre** (Basic Pitch en el navegador): más pesada y menos fiable que verificar notas conocidas; es lo que Kevin temía.
- **Subir el audio al servidor**: viola ADR 0016 (el servidor no guarda nada) y añade latencia.
- **FFT de 4096** (≈ 85 ms de latencia en vez de ≈ 150 ms): se probó y se descartó; en la simulación pierde notas graves y acepta una nota esperada cuando se toca un semitono más abajo.
- **Cancelación de eco del navegador**: ahogaría el piano junto con el vídeo.

## Consecuencias

- **Limitaciones medidas**: dos notas a distancia de octava (graves de mano izquierda) no se pueden verificar por separado; si la canción espera ambas, se acreditan ambas con que suene la grave. Una voz o un silbido que imite el tono esperado, y de forma estable, puede pasar. Por debajo de Do2 y por encima de Do7 no hay garantías.
- La latencia de ~150 ms hace que en juego libre se juzgue hacia atrás (`ageS`) y que el modo espera reaccione un poco tarde; en modo espera no importa.
- **Sin verificar**: todo está medido con un piano y una sala **simulados**; falta probarlo con el Vangoa real (pendiente de Kevin). El procedimiento y la tabla están en `docs/phase-1/microfono-mediciones.md`.
- Las pruebas de la medición completa se ejecutan a mano (`MIC_EVAL=ruta.md npx vitest run src/core/audio/micEval.test.ts`, unos minutos) y una versión reducida corre en cada PR.
