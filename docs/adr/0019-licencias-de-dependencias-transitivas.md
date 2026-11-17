# ADR 0019 — Licencias de dependencias transitivas fuera de la lista permisiva

Estado: **Propuesta** (espera la decisión de Kevin). Complementa el ADR 0012.

## Contexto
La regla del proyecto es usar solo licencias permisivas (MIT, BSD, Apache, Unlicense). La revisión final (D3) listó las licencias de todo lo instalado (`pip-licenses` en el backend, `package-lock.json` en el frontend) y encontró cuatro casos que no están en esa lista. Ninguno es código copiado al repositorio: son paquetes que llegan como dependencias de otras.

| Paquete | Licencia | De dónde viene | Dónde corre |
|---|---|---|---|
| `soxr` | LGPL-2.1 o posterior | `librosa` (modelo ByteDance) | Imagen Docker de producción |
| `certifi` | MPL-2.0 | `httpx`, `requests` | Producción (certificados raíz) |
| `pathspec` | MPL-2.0 | herramientas de desarrollo | Solo desarrollo |
| `jszip` | MIT **o** GPL-3.0 | OpenSheetMusicDisplay | Navegador; se elige MIT |

Además `basic-pitch` declara la licencia como «UNKNOWN» en sus metadatos; su repositorio es Apache-2.0 (ya figura en `NOTICE`).

## Decisión propuesta
1. **Aceptar `certifi`, `pathspec` y `jszip`.** La MPL-2.0 solo obliga a publicar los cambios hechos a esos mismos archivos, y no los modificamos. `jszip` se usa bajo su opción MIT.
2. **Aceptar `soxr` como excepción documentada.** La LGPL permite usar la biblioteca sin modificarla y enlazada dinámicamente (es un paquete binario de Python que se puede reemplazar). Se mantiene sin modificar y se cita en `NOTICE`. Si en el futuro se quisiera una imagen sin ninguna cláusula copyleft, el reemplazo sería `librosa` por una resampleadora permisiva, o resamplear con `ffmpeg` (ya presente).
3. **No añadir nada con GPL o AGPL**, ni como dependencia directa ni transitiva; la regla del ADR 0012 sigue igual para ellas.
4. **Revisar en cada cambio de dependencias** con `pip-licenses` y `package-lock.json`.

## Consecuencias
- `NOTICE` pasa a citar `soxr` y `certifi`.
- Si Kevin prefiere cero excepciones, la alternativa es sustituir `soxr` (ver arriba) antes de abrir el sitio al público; costaría revisar el preprocesado de audio del modelo ByteDance con canciones reales.
