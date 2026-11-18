# 0003. D-03 Dominio y HTTPS

- Fecha: 2026-11-14
- Estado: Propuesta
- Origen: registro de decisiones del 14 de noviembre de 2026 (D-03)

## Contexto

La Web MIDI API exige contexto seguro. El plan Always Free no incluye registro de dominios. Lo que la app guarda en el navegador (D-07) queda atado al dominio.

## Decisión

Subdominio gratuito de DuckDNS con Let's Encrypt durante el desarrollo, y dominio propio antes de abrir el sitio al público (.com en Cloudflare, unos 11,17 USD al año, o .com.co, 15 USD).

## Alternativas consideradas

- Comprar el dominio desde el primer día: el proyecto aún no tiene nombre y conviene esperar a que la prueba de la Fase 0 confirme que sigue.

## Consecuencias

El cambio de dominio debe hacerse antes de abrir al público, o los usuarios perderían sus bibliotecas. Pendiente: elegir el nombre del proyecto.
