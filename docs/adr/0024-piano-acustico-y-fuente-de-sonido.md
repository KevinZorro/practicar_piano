# ADR 0024 — Piano acústico con muestras y fuente de sonido elegible

Estado: **Aceptada** (petición de Kevin, 2026-11-22). Complementa el ADR 0022 y la licencia de dependencias (D-12).

## Contexto

El piano de la app era una voz FM de Tone.js: suena a piano eléctrico y a Kevin no le gusta. Además, al practicar con video solo se podía elegir entre «video con su sonido» y «video oculto con el piano de la app»; no había forma de dejar el video a la vista pero en pausa, ni de oír los dos a la vez.

## Decisión

1. **Muestras de Salamander Grand Piano V3** (Alexander Holm, CC BY 3.0, distribuidas por Tonejs/audio), una grabación por cada tercera menor de A0 a C8 (30 archivos, 2 MB), tocadas con `Tone.Sampler`. CC BY pide atribución: `frontend/public/samples/piano/LICENSE.md` y la sección «Créditos» de `terminos.html`.
2. **Se alojan en la propia app** (`public/samples/piano`) y no en un CDN, porque el CSP solo permite `'self'` y para no mandar la IP del jugador a terceros. Se descargan al abrir la práctica (`preload`), no al pulsar Reproducir. Si fallan o aún no llegaron, suena la voz FM anterior: nunca hay silencio.
3. **Excepción a «no se versiona audio»**: `.gitignore` deja pasar solo `frontend/public/samples/piano/*.mp3`. La regla existe por el audio con derechos de canciones; estas grabaciones tienen licencia que permite redistribuirlas. Es una licencia con atribución, no permisiva sin condiciones: se acepta por ser solo datos de audio, no código.
4. **Preferencia `audio`** (`video` | `piano` | `both`, por defecto `video`) en lugar del interruptor «Sonido» cuando la canción tiene video. En `piano` el video queda en pausa (a la vista, sin responder a clics) y el reloj lo cuenta el contador del sintetizador; en `both` suena el video y el piano de la app encima. Con el video oculto sigue sonando el piano de la app, como antes. Elegir `video` o `both` muestra el video (YouTube exige verlo para reproducirlo).

## Consecuencias

- +2 MB de descarga la primera vez que se abre una práctica (luego en caché del navegador).
- El timbre real no se pudo escuchar en la nube: queda sin verificar hasta que Kevin lo oiga.
