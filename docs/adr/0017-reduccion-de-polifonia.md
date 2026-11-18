# 0017. Reducción de polifonía para poder tocar

- Fecha: 2026-11-17
- Estado: Aceptada (implementada en `backend/src/teclario/domain/polyphony.py`, incremento B1b)
- Relacionada con: [0014](0014-bytedance-asincrono-y-simplificacion.md), [0008](0008-visualizacion-y-practica.md)

## Contexto
ByteDance transcribe todo lo que suena y en piezas difíciles produce acordes de 15 notas o más. Un pianista puede sostener como máximo 10 notas a la vez (cinco por mano). Kevin pide un algoritmo que reduzca sin romper la armonía.

## Principio musical
Un oyente reconoce una pieza por la **melodía** (voz más aguda), el **bajo** (voz más grave) y la **función armónica** que dibujan juntos: fundamental, tercera (define mayor o menor) y séptima (define el carácter dominante). La **quinta** casi no cambia el color del acorde y el oído la «completa» solo; los **duplicados de octava** suman volumen, no armonía. Se quita primero lo que el oído reconstruye y se protege lo que define el acorde.

## Algoritmo (función pura del dominio, `PolyphonyReducer`)
Entrada: notas `(pitch, start, end, velocity)` y una `PlayabilityPolicy` (`max_total=10`, `max_per_hand=5`, `max_span=16` semitonos, una décima, en `playable`; `easy`: 4 por mano, octava y 8 en total).

1. **Notas fantasma:** se descartan las de duración < 60 ms y velocidad en el cuartil inferior (artefactos del modelo).
2. **Rebanadas de tiempo:** se agrupan inicios dentro de una ventana de 50 ms como un solo acorde (un golpe, no un arpegio). Se evalúa en cada instante de inicio el conjunto de notas sonando (nuevas y sostenidas).
3. **Mano:** do central como frontera (D-08), moviendo la frontera para que ninguna mano pase de 5 notas ni de `max_span`.
4. **Puntuación** de cada nota candidata a quitarse:
   - Protegidas (no se quitan): la más aguda y la más grave del conjunto sonando.
   - Se estima la fundamental del conjunto por plantillas (tríadas y séptimas sobre las clases de altura presentes, ponderadas por velocidad).
   - Peso por función: fundamental 3,0 · tercera y séptima 2,5 · novenas, oncenas, trecenas 1,5 · quinta 1,0 · duplicado de octava de una clase ya conservada 0,2.
   - Desempate: menor velocidad y menor duración se quitan antes.
5. **Reducción:** mientras se incumpla algún límite (por mano, alcance o total), se quita la nota de menor puntuación no protegida. Una nota sostenida que se quita en el instante `t` se **trunca** en `t` (no se borra entera), para no perder su comienzo.
6. **Informe:** `notes_dropped_ratio` y la polifonía máxima antes y después van en `meta`, para que la interfaz diga cuánto se simplificó.

## Propiedades que se prueban
Nunca se supera el límite por mano, el alcance ni el total; melodía y bajo sobreviven; no se crean notas ni se mueven inicios; es idempotente; con polifonía baja no cambia nada; entre un duplicado de octava y una tercera, sobrevive la tercera; con tríada + séptima + quinta que obliga a quitar una, se quita la quinta.

## Alternativas consideradas
- Quitar siempre las más suaves: rompe acordes y deja huecos armónicos.
- Reducir en el navegador: duplica lógica; el servidor entrega todos los niveles (ADR 0016).

## Consecuencias
La política se afina oyendo las canciones difíciles de Kevin (fixtures sintéticas con su forma, nunca audio protegido). Si algún nivel resulta irreconocible se ajustan los pesos, no el algoritmo.

## Notas de la implementación (2026-11-17)
- Las manos no se fijan en el do central: para cada instante se busca la partición en mano izquierda y derecha que cumpla los límites (la regla del do central de D-08 se aplica después, al separar manos en B2).
- Solo se consideran para quitar las notas cuya eliminación acerca el conjunto a lo tocable; así no se sacrifica una nota barata del lado equivocado del teclado.
- En cada inicio se exige que sean tocables las notas que suenan más las que empiezan dentro de los 50 ms siguientes; como quitar notas solo facilita el conjunto, una segunda pasada no cambia nada (probado con 100 piezas aleatorias por nivel).
- Una misma tecla no puede sonar dos veces: las copias casi simultáneas se funden y una nota nueva corta a la anterior.
- Si dos manos no alcanzan (por ejemplo tres notas separadas por más de una décima cada una), se quita la interna más barata aunque sea la tercera: el límite de alcance manda sobre el número de notas.
- Rendimiento: 12 000 notas en ≈ 1 s.
