# ADR 0021 — Fuente Atkinson Hyperlegible Next (licencia SIL OFL 1.1)

Estado: **Propuesta** (pendiente del visto bueno de Kevin). Complementa los ADR 0012 y 0019.

## Contexto

El rediseño de la Fase 1 (`docs/phase-1/identidad-visual.md`) necesita una fuente muy legible a 60–80 cm, con las manos en el teclado: letras que no se confundan (I, l, 1; O, 0), acentos claros y cifras nítidas para el tiempo y el compás. La misma fuente escribe los nombres de las notas dentro de la partitura (OpenSheetMusicDisplay), así que también debe tener métricas estables en todos los sistemas, cosa que la fuente del sistema no garantiza.

La regla del proyecto admite MIT, BSD, Apache y Unlicense. Casi todas las fuentes libres de calidad usan la **SIL Open Font License 1.1** (OFL), que no está en esa lista.

## Decisión

1. Usar **Atkinson Hyperlegible Next** (Braille Institute; copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors), versión variable, **sin modificar**, desde el paquete npm `@fontsource-variable/atkinson-hyperlegible-next` (5.3.0, fijado en `package-lock.json`). Se sirve desde el propio sitio (subconjuntos latín y latín extendido), sin pedir nada a terceros.
2. Aceptar la OFL 1.1 para **fuentes tipográficas**: permite usarla, incrustarla y distribuirla con cualquier software, también comercial. Sus condiciones son conservar el aviso de copyright y la licencia, no vender la fuente sola y renombrar las versiones modificadas; no modificamos la fuente ni la vendemos.
3. Citarla en `NOTICE`. La licencia completa viaja con el paquete.
4. Nada cambia para el código: GPL y AGPL siguen prohibidas (ADR 0012).

## Alternativas consideradas

- **Fuente del sistema** (`system-ui`): cero dependencias, pero se ve distinta en cada sistema, es menos legible a distancia y cambia las medidas de los nombres en la partitura. Es el respaldo si se rechaza esta ADR.
- **Fuentes con licencia Apache 2.0** (versiones antiguas de Roboto u Open Sans): hoy también se publican con OFL, y no están diseñadas para la legibilidad como Atkinson.
- **Inter, Source Sans u otras**: también son OFL; no resuelven la cuestión de la licencia y son menos distintivas para leer a distancia.

## Consecuencias

- Unos 53 KB de fuente (woff2) que el navegador guarda en caché.
- Si Kevin la rechaza, volver a la fuente del sistema es quitar el `@import` de `frontend/src/styles/tokens.css` y el paquete (`--font` ya cae a `system-ui`), y poner `FONT_FAMILY = 'system-ui'` en `frontend/src/adapters/sheet/osmdSheet.ts` para la partitura.
- La revisión de licencias de cada cambio de dependencias (ADR 0019) debe aceptar `OFL-1.1` solo para paquetes de fuentes.
