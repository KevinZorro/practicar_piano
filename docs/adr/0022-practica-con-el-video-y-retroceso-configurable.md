# ADR 0022 — Práctica guiada por el video y retroceso configurable

Estado: **Aceptada** (petición de Kevin, 2026-11-19). Complementa el ADR 0014 y el modo espera de la Fase 1.

## Contexto

La transcripción automática no es idéntica a la canción: cambia notas, funde acordes y omite adornos. Muchos covers de YouTube traen además sus propias notas cayendo, más fieles que cualquier transcripción. Kevin quiere practicar con el video como referencia principal, a su ritmo, y que la transcripción solo haga de «hoja de respuestas»: si toca una tecla equivocada, el video vuelve atrás solo. Dos riesgos: que el retroceso no sea configurable (hasta ahora eran 5 s fijos y solo en modo espera) y que el visor se ponga a cargar tras cada `seekTo`, con las notas corriendo por delante del video.

## Decisión

1. **Nuevo modo «Retroceso automático»** (`core/practice/followMode.ts`), excluyente con el modo espera. La canción nunca espera: sigue el reloj del video. Una tecla cuenta si hay una nota de ese tono a ±0,3 s (la misma ventana que `Judge`); si no, es un fallo y el reloj retrocede `rewindS` segundos. Opcional: un acorde que pasa sin tocar ninguna de sus notas también cuenta como fallo (desactivado por defecto, porque la transcripción puede inventar o perder acordes; solo se evalúa tras la primera tecla de la pasada).
2. **Segundos de retroceso configurables** (1–30, por defecto 5), guardados con el resto de preferencias en `localStorage` (`rewindS`, `rewindOnMiss`). Valen para el modo espera y para el nuevo modo.
3. **Contra la carga del visor**:
   - Un retroceso corto cae casi siempre en datos ya descargados, así que se usa un `seekTo` simple sin pausar el video.
   - Nuevo método opcional `isBuffering()` en `PlayerPort` (el adaptador de YouTube lo alimenta con el estado `BUFFERING`). Mientras el video carga, `InterpolatedClock` mantiene la posición quieta, así que las notas esperan al video en vez de correr por delante, y retoman cuando vuelve a reproducir.
   - Enfriamiento: tras un retroceso se ignoran nuevos fallos hasta que la canción avance 0,6 s desde el punto de llegada, para que un video que aún carga no encadene retrocesos.
4. **Progreso**: una pasada completa en este modo guarda su intento. Si hubo retrocesos se registra como asistida (`waitMode: true`) y no puede marcar la canción como dominada; sin retrocesos cuenta como pasada limpia.

## Alternativas consideradas

- Pausar el video, buscar y reanudar con una cuenta atrás: evita el desfase pero interrumpe más que el congelado del reloj. Queda como mejora si la prueba con YouTube real lo pide.
- Retroceder siempre al inicio del compás: más musical, pero exige el timemap en el modo y no es lo que se pidió; los segundos configurables cubren el caso.
- Juzgar también las notas largas sostenidas: la transcripción no es lo bastante fiable para eso.

## Consecuencias

- El modo es tan fiable como la transcripción: una nota real del video que ella no tiene cuenta como fallo. Por eso se puede elegir el nivel y las manos, y el aviso de la configuración lo dice.
- **Sin verificar con YouTube real ni con el teclado de Kevin**: las pruebas usan un reloj y un video simulados.
