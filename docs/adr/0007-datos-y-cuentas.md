# 0007. D-07 Datos, privacidad y cuentas

- Fecha: 2026-11-14
- Estado: Propuesta
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-07)

## Contexto

No guardar datos personales simplifica seguridad y términos de uso. La Ley 23 de 1982 reserva al autor la adaptación de su obra, lo que impide un catálogo común de transcripciones.

## Decisión

Sin cuentas en el MVP. La biblioteca (enlace, MIDI, partitura y progreso) vive en IndexedDB y se exporta/importa como archivo. El servidor borra el audio al terminar y no guarda MIDI ni partitura; los registros no guardan los enlaces procesados.

## Alternativas consideradas

- Cuentas y base de datos en servidor: fase 2.

## Consecuencias

Quien cambia de navegador o equipo sin exportar pierde su biblioteca. Una canción se marca dominada al tocarla completa sin modo espera, al 100 % de velocidad y con ≥ 90 % de notas correctas (umbral a ajustar).
