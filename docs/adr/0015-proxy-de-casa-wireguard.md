# 0015. Proxy de casa por WireGuard: topología y herramientas

- Fecha: 2026-11-15
- Estado: Propuesta
- Relacionada con: [0004](0004-origen-del-audio.md) (D-04), [0002](0002-infraestructura-oracle.md)

## Contexto
La descarga directa desde la VPS quedó bloqueada por YouTube en las 10 canciones, mientras que desde el PC de casa (Windows) sí funciona. D-04 ya prevé un proxy pequeño en la casa del autor conectado por WireGuard. Esta ADR fija los detalles de implementación; no cambia D-04.

## Decisión
- **Topología:** la VPS es el servidor WireGuard (IP pública estable, UDP 51820) y el PC de casa es el cliente que marca hacia afuera con `PersistentKeepalive = 25`. Así funciona detrás de NAT doméstico o CGNAT sin abrir puertos en el router.
- **Túnel dividido:** subred `10.8.0.0/24`, VPS `10.8.0.1`, casa `10.8.0.2`, y `AllowedIPs` de un solo `/32` por lado. Solo viaja el tráfico del proxy; el tráfico normal del PC y de la VPS no cambia.
- **Proxy:** `gost` (MIT, un solo ejecutable) en **Windows nativo**, como SOCKS5 escuchando solo en `10.8.0.2`, con regla de firewall que admite únicamente a `10.8.0.1`, y tarea programada al arrancar. yt-dlp lo usa con `socks5h://` (DNS resuelto en casa).
- **VPS → contenedor:** sin cambios de red en Docker. El contenedor sale por la red puente, el host lo enruta por `wg0` y Docker enmascara el origen como `10.8.0.1`, que es justo lo que el firewall del PC admite. `TECLARIO_PROXY_URL` sigue siendo la única interfaz con la aplicación.
- **Secretos:** cada extremo genera su clave; en el repositorio solo hay plantillas con marcadores. El renderizador valida el formato de las claves antes de escribirlas.
- **Firewall de Oracle:** doble capa, security list de OCI (UDP 51820 de entrada) más una regla de `iptables` insertada antes del `REJECT` por defecto de las imágenes de Oracle.

## Alternativas consideradas
- **WSL2 o Docker en el PC:** la red NAT de WSL2 complica enlazar el proxy a la interfaz del túnel, añade capas (Hyper-V, reenvío de puertos) y exige que WSL esté arrancado; el cliente oficial de WireGuard para Windows y un ejecutable único dan menos piezas que fallar. Para quien tenga Linux en casa, `gost` o `microsocks` en la misma interfaz sirven igual.
- **Servidor WireGuard en casa:** exige abrir un puerto en el router y falla con CGNAT o IP dinámica.
- **`AllowedIPs = 0.0.0.0/0` en el PC:** mandaría todo su tráfico por la VPS.
- **Otros proxies en Windows:** 3proxy (licencias duales con GPL, descartado por la regla de licencias), Dante (solo Linux).
- **Autenticación usuario/contraseña en el proxy:** innecesaria con el túnel autenticado por clave y el firewall por dirección; añadiría un secreto dentro de `TECLARIO_PROXY_URL`.

## Consecuencias
- La prueba depende de que el PC de casa esté encendido y con el túnel activo; es aceptable en la Fase 0. Para la Fase 1 habrá que decidir entre un equipo siempre activo o el proxy residencial de pago.
- Se usa la IP de casa con YouTube: bajo volumen (10 canciones) y riesgo de que también se marque; el respaldo sigue siendo el de D-04.
- Las plantillas y los scripts se prueban sin red; el túnel real y el bypass del bloqueo quedan **sin verificar** hasta correr `docs/phase-0/proxy-casa-wireguard.md`.
- `gost` (MIT) y WireGuard (GPLv2 en Linux, MIT en Windows) son herramientas del sistema que se instalan aparte; el repositorio no las distribuye, solo trae configuración propia.
