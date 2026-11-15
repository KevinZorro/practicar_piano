# 0004. D-04 Origen del audio: enlace de YouTube

- Fecha: 2026-11-14
- Estado: Aceptada
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-04)

## Contexto
El usuario solo pega el enlace; la VPS baja el audio con yt-dlp, lo transcribe y lo borra sin entregárselo. YouTube suele bloquear descargas desde centros de datos. Desde noviembre de 2025 yt-dlp necesita un runtime de JavaScript como Deno.

## Decisión
Descarga directa desde la VPS; si YouTube la bloquea, salida por la conexión de la casa del autor con un proxy pequeño conectado por WireGuard; proxy residencial de pago por uso (≈1 USD/GB, ≈1 centavo por canción) como respaldo. La imagen de Docker incluye y actualiza Deno. En la Fase 0 el proxy es opcional por la variable `PIANOLA_PROXY_URL`.

## Alternativas consideradas
- Subir un archivo: añade un paso al usuario (queda como respaldo).
- Versión local en el computador del usuario: exige instalar, choca con D-01.
- Capturar el audio de una pestaña: obliga a reproducir la canción completa, pide permiso de pantalla y choca con las políticas de la API de YouTube.

## Consecuencias
Se acepta el riesgo legal (términos de YouTube, contrato de Oracle). Mitigaciones: no entregar el audio, no publicar transcripciones, sin AdSense, contacto para reclamos y términos de uso que pidan enlaces de audio que el usuario pueda usar.
