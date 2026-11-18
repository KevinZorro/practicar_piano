# 0016. Entrega sin caché en el servidor, límites de uso y aviso al terminar

- Fecha: 2026-11-17
- Estado: Aceptada (respuestas de Kevin del 2026-11-17 a la sección 9 del plan de la Fase 1)
- Modifica: [0007](0007-datos-y-cuentas.md) (corrige la propuesta de «caché con TTL de 24 h» de la revisión 2 del plan)
- Relacionada con: [0014](0014-bytedance-asincrono-y-simplificacion.md)

## Contexto
La revisión 2 del plan proponía una caché de resultados de 24 horas en el servidor. Kevin la descarta: el servidor procesa la canción, la entrega al usuario y la borra; el usuario ya la tiene guardada en su navegador (IndexedDB). También fija un máximo de 10 minutos por canción, deja a Claude el tamaño de la cola, pide un algoritmo de reducción de polifonía (ADR 0017), quiere solo notificación del navegador por ahora (correo gratuito más adelante) y deja a Claude el nombre.

Capacidad de la VPS (medida por Kevin): ARM Neoverse-N1, 2 núcleos, 12 GiB de RAM, sin swap, 17 GB libres de disco. ByteDance usa ≈ 1,5 GB y tarda ≈ 2× la duración de la canción.

## Decisión
1. **Sin caché.** El resultado existe en el servidor solo entre el fin del procesado y su entrega. Se borra al confirmar la entrega (`GET /result` correcto seguido de `DELETE`, o `DELETE` directo). Para el caso de que el navegador nunca vuelva, una **expiración de seguridad de 6 horas** lo borra solo. El resultado se guarda en memoria del proceso (unos cientos de KB): si el servicio reinicia, se pierde y el cliente ofrece reintentar. No hay clave por video ni catálogo común.
2. **Consecuencia de no tener caché:** no se puede recalcular el nivel de dificultad en el servidor. La respuesta incluye ya las notas reducidas de **todos** los niveles (`full`, `playable`, `easy`) y el cliente guarda todo; cambiar de nivel es local.
3. **Duración máxima: 10 minutos** (`MAX_DURATION_S = 600`), consultada con yt-dlp antes de descargar.
4. **Cola: 1 trabajo en proceso + 5 en espera como máximo.** Un trabajo de 10 min ocupa la VPS ≈ 20 min; uno típico de 3–4 min, ≈ 6–8. Con 5 en espera la espera típica es ≈ 35–45 min y la peor, ≈ 2 h; más allá deja de ser un servicio utilizable y solo acumula trabajo que el usuario ya no esperará. Con la cola llena la API responde 503 con `Retry-After`. Cabe en memoria de sobra (un solo worker); el límite lo impone el tiempo, no la RAM.
5. **Por IP: máximo 2 trabajos activos** (en espera o procesando) y 6 por hora, para que una persona no ocupe todos los puestos.
6. **Aviso al terminar:** Notificaciones del navegador (permiso pedido al enviar el enlace), título de la pestaña y sonido. Con la pestaña cerrada, el aviso llega al reabrir. Correo gratuito: mejora posterior, sin decidir proveedor todavía.
7. **Nombre:** se mantiene **Pianola**, que ya está en el código, el paquete y la CLI. Antes de publicar (D2) hay que comprobar que el dominio esté libre; si no, se cambia entonces con una ADR.
8. **Numeración:** el ADR 0015 lo tomó el proxy de casa, así que los ADR previstos en el plan se renumeran: 0016 (este), 0017 reducción de polifonía, y a partir de 0018 reloj de reproducción, pulso y partitura, biblioteca local.

## Alternativas consideradas
- Caché de 24 h en volumen (rev. 2): descartada por Kevin; añade estado y riesgo legal sin necesidad porque el cliente guarda el resultado.
- Cola de 10: espera de hasta 4 h, el usuario no la esperaría.
- Resultado en disco: sobrevive a reinicios pero obliga a limpiar archivos; no compensa en el MVP.

## Consecuencias
- `ResultCache` del plan pasa a ser `ResultStore` (entrega única, expiración de seguridad).
- El contrato de `GET /jobs/{id}/result` ya no admite `?level=`; devuelve todos los niveles.
- Los límites son constantes de configuración (variables de entorno), ajustables sin tocar el dominio.
- Riesgo asumido: un reinicio del servicio pierde los resultados no entregados y la cola.
