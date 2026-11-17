# Revisión final de la Fase 1 (D3) — avance

Fecha: 2026-11-17. Hecho en el entorno de desarrollo; lo que depende de la VPS o de personas queda marcado.

## Seguridad
- **Secretos:** el trabajo `secrets` de la CI corre `gitleaks` en cada PR. Los registros del servidor ocultan los enlaces de YouTube (`install_log_redaction`, con prueba), y el navegador solo guarda el identificador del vídeo.
- **Dependencias del frontend:** `npm audit --omit=dev` → 0 vulnerabilidades (lo que llega al navegador). Con las de desarrollo hay 12 «altas», todas por `picomatch` (ReDoS) dentro de `vite`, `vitest` y `typescript-eslint`: solo afectan a quien construye, no al sitio publicado. `npm audit fix` no puede aplicarse limpio; se actualizarán esas herramientas en su siguiente subida mayor.
- **Dependencias del backend:** `pip-audit` → 5 avisos en 2 paquetes, ninguno alcanzable desde el servicio:
  - `protobuf` 4.25.9 (aviso de denegación de servicio al leer mensajes anidados): lo fija `onnxruntime`; el servicio nunca lee protobuf que envíe un usuario, solo el modelo propio.
  - `setuptools` 80.10.2 (avisos de la herramienta de empaquetado): se mantiene por debajo de 81 porque `resampy` necesita `pkg_resources`; no se ejecuta en producción.
- **Superficie del servicio:** límites de duración, cola, ritmo por IP, resultado sin caché y borrado tras la entrega (ADR 0016); Nginx con HTTPS, CSP restringida a YouTube y cabeceras de seguridad.
- **Licencias:** ver el ADR 0019 (aceptado) y `NOTICE`.

## Pendiente
- Memoria y tiempo con una canción real en la VPS (`docker stats` durante el procesado).
- README con capturas (hoy sigue describiendo la Fase 0).
- Proceso de reclamos de derechos y términos de uso (D2).
