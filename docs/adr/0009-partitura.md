# 0009. D-09 Partitura sincronizada

- Fecha: 2026-11-14
- Estado: Aceptada
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-09)

## Contexto
El usuario objetivo quiere aprender a leer partitura desde el principio. Convertir un MIDI en partitura es difícil, incluso para equipos dedicados.

## Decisión
El servidor estima el pulso, cuantiza, reparte manos con la regla de D-08 y genera MusicXML con music21; OpenSheetMusicDisplay lo dibuja con un cursor sincronizado. Se permite descargar MIDI y MusicXML para corregirlos en MuseScore.

## Alternativas consideradas
- Dejar la partitura para la fase 2: descartado por el perfil del usuario objetivo.

## Consecuencias
La partitura es aproximada (hereda errores de transcripción y falla con rubato). La corrección dentro de la app queda para la fase 2. No forma parte de la Fase 0.
