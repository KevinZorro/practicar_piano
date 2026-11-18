# ADR 0018 — Pulso, cuantización y partitura

Estado: Aceptada (nueva; implementa B1–B3 del plan de la Fase 1).

## Decisión

1. **Tempo:** se estima con la resultante media de los instantes de inicio plegados al pulso, a la mitad y a la cuarta parte del pulso (`score = (pulso + mitad + |cuarto|) / 3`). Un prior de tempo y una tolerancia de octava evitan confundir negras con corcheas. La confianza es «alta» si la alineación llega a 0,6.
2. **Cuadrícula:** 12 celdas por negra, compás de 4/4 (48 celdas). Cada pulso elige entre semicorcheas (3 celdas) y tresillos de corchea (4 celdas).
3. **Manos:** do central como frontera (D-08).
4. **Partitura:** music21 (BSD-3) genera MusicXML con dos pentagramas (clave de sol y de fa), tempo y compás. Cada mano es una línea monofónica de acordes y silencios; los valores no escribibles se parten y se ligan, también a través de la barra de compás. Lo que dura menos de una semicorchea no se escribe.
5. **Timemap:** compás → segundo de inicio, para que el cursor de la partitura siga el vídeo (C6).
6. **Dependencia:** music21 va en el extra opcional `score`; CI y la imagen Docker lo instalan.

## Consecuencias

- El dominio sigue sin importar music21; el puerto `ScoreBuilder` lo aísla en `infrastructure/music21_score.py`.
- No hay compases cambiantes ni tempo variable: una canción con rubato queda aproximada. Se revisará con canciones reales.
- Sin verificar con canciones reales de Kevin: la legibilidad de la partitura se juzga por oído y vista en C6.
