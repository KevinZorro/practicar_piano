# 0005. D-05 Reproducción con el reproductor oficial de YouTube

- Fecha: 2026-11-14
- Estado: Propuesta
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-05)

## Contexto

El reproductor incrustado pone el audio de la práctica y deja ver las manos. Su API permite saltar a cualquier segundo y cambiar la velocidad. Es asíncrona, así que la sincronía requiere un ajuste fino del desfase.

## Decisión

Reproductor oficial (IFrame API) de al menos 200×200 px. Si el video no se puede insertar, la práctica suena con el MIDI y un piano de Tone.js, que el usuario también puede elegir para evitar anuncios.

## Alternativas consideradas

- Reproducir solo el audio descargado: prohibido por las políticas de la API de YouTube.

## Consecuencias

No se pueden vender anuncios sobre o dentro del reproductor (D-10). La página debe tener contenido propio de valor (notas cayendo, modo práctica).
