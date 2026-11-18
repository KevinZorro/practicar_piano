# 0002. D-02 VPS Always Free de Oracle Cloud

- Fecha: 2026-11-14
- Estado: Aceptada
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-02)

## Contexto

Desde el 15 de junio de 2026 el límite gratuito de Ampere A1 es de 2 OCPU y 12 GB, con 200 GB de disco y 10 TB de salida al mes. La plataforma de la práctica empresarial no usa esta cuenta, así que el proyecto puede ocupar todo.

## Decisión

Una instancia Ampere A1 (ARM64) con 2 OCPU y 12 GB, empaquetada con Docker Compose para poder mudarla en minutos. Las imágenes se compilan para linux/arm64.

## Alternativas consideradas

- Otro proveedor de pago: descartado por costo en un proyecto gratuito de portafolio.

## Consecuencias

Riesgo: Oracle puede detener instancias que superen el límite o que considere inactivas (CPU p95, red y memoria por debajo del 20 % durante siete días), sin soporte. Un reclamo de derechos de autor por la descarga (D-04) es otra causa posible. Mitigación: contenedores listos para mudarse.
