# Proxy de casa con WireGuard (plan B de la descarga)

Úsalo cuando YouTube bloquea la VPS (`Sign in to confirm you're not a bot`). Decisiones y porqué: ADR [0015](../adr/0015-proxy-de-casa-wireguard.md). Archivos: `infra/wireguard/` e `infra/home-proxy/`.

```
contenedor (yt-dlp) → VPS wg0 10.8.0.1 ══ WireGuard (UDP 51820) ══► PC de casa 10.8.0.2:1080 (SOCKS5) → YouTube
```

El PC de casa **marca hacia la VPS** (no hace falta abrir puertos en el router ni IP fija en casa). Solo el tráfico de yt-dlp sale por tu casa; el resto de la VPS y de tu PC no cambia.

**Necesitas:** la IP pública de la VPS, acceso a la consola de Oracle, el PC con Windows 10/11 encendido durante la prueba y PowerShell como administrador. Tiempo: unos 20 minutos.

> Estado: los archivos se probaron solo sin red (formato, claves, direcciones). El túnel real y la descarga desde tu casa **no están verificados** hasta que corras el paso 7.

## 1. PC de casa: instalar WireGuard y crear el túnel vacío
1. Instala WireGuard para Windows desde <https://www.wireguard.com/install/>.
2. En la app: flecha junto a **Add Tunnel** → **Add empty tunnel…**. Nombre: `pianola`. La app genera el par de claves; la clave privada no sale de tu PC.
3. Copia la línea **Public key** que muestra la app (la usarás en el paso 3). Deja la ventana abierta.

## 2. Oracle: abrir UDP 51820 en la security list
Consola de OCI → Networking → Virtual Cloud Networks → tu VCN → la subred de la VPS → **Security Lists** → la lista por defecto → **Add Ingress Rules**:

| Campo | Valor |
|---|---|
| Source CIDR | `0.0.0.0/0` (tu IP de casa cambia; WireGuard ignora en silencio todo paquete sin clave válida) |
| IP Protocol | UDP |
| Destination Port Range | `51820` |

Si la VPS usa un Network Security Group en vez de la lista, agrega la misma regla ahí. La salida ya está abierta (reglas con estado).

## 3. VPS: servidor WireGuard y firewall del host
```bash
cd ~/practicar_piano && git fetch origin && git checkout <rama-de-este-trabajo>
sudo HOME_PUBLIC_KEY='<clave pública del paso 1>' bash infra/wireguard/vps/setup-vps.sh
```
El script instala WireGuard e `iptables-persistent`, genera la clave del servidor en `/etc/wireguard/` (permisos 600, fuera del repositorio), abre `udp/51820` con `iptables -I INPUT` (antes del `REJECT` que traen las imágenes de Oracle), guarda las reglas y levanta `wg-quick@wg0`. Al final imprime la **clave pública del servidor**: cópiala.

## 4. PC de casa: completar y activar el túnel
Pega esto en la ventana del túnel `pianola`, debajo de la `PrivateKey` que ya puso la app (plantilla: `infra/wireguard/home/pianola-home.conf.example`):

```ini
[Interface]
# PrivateKey = ... (la deja la app, no la toques)
Address = 10.8.0.2/24

[Peer]
PublicKey = <clave pública del servidor, paso 3>
AllowedIPs = 10.8.0.1/32
Endpoint = <IP pública de la VPS>:51820
PersistentKeepalive = 25
```
Guarda y pulsa **Activate**. No cambies `AllowedIPs` a `0.0.0.0/0`: mandaría todo tu tráfico por la VPS. La app instala el túnel como servicio y vuelve a levantarlo al reiniciar.
Comprueba en PowerShell: `ping 10.8.0.1` (si falla ahora, revisa la tabla de problemas; el ping de la VPS hacia el PC lo habilita el paso 5).

## 5. PC de casa: proxy SOCKS5 solo en el túnel
1. Descarga `gost` (licencia MIT) de <https://github.com/go-gost/gost/releases>: el `.zip` de Windows `amd64` (o `arm64` si tu PC es ARM). En la misma página copia el SHA-256 de ese archivo.
2. Con el repositorio clonado en tu PC, en PowerShell **como administrador**:
```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\infra\home-proxy\windows\Install-HomeProxy.ps1 -GostZip $HOME\Downloads\<archivo>.zip -ExpectedSha256 <sha256>
```
El script se niega a seguir si el hash no coincide. Crea: reglas de firewall (TCP 1080 y ping solo desde `10.8.0.1`, sobre `10.8.0.2`) y una tarea programada que arranca `gost` al iniciar Windows, esperando a que exista la interfaz del túnel. Escucha en `10.8.0.2`, nunca en `0.0.0.0`.
3. Que el PC no se suspenda mientras corre la prueba: `powercfg /change standby-timeout-ac 0`.

## 6. VPS: configurar la variable
```bash
echo 'NOTACAIDA_PROXY_URL=socks5h://10.8.0.2:1080' > infra/.env   # .env está en .gitignore
```
`socks5h` resuelve el DNS en el proxy (en tu casa), que es lo que quieres.

## 7. Verificar (de menor a mayor)
```bash
bash infra/wireguard/vps/check-tunnel.sh
docker compose -f infra/docker-compose.yml run --rm check-proxy   # imprime "HTTP/2 200" o similar
```
`check-tunnel.sh` revisa cinco cosas: handshake, ping, YouTube por el proxy desde el host, lo mismo desde un contenedor y que la IP de salida sea la de tu casa y no la de la VPS. Con todo en OK, corre el benchmark:
```bash
docker compose -f infra/docker-compose.yml run --rm phase0 phase0 run --links /data/links.txt --out /data/out
```
El informe debe decir `YouTube via proxy`. Cuando funcione, actualiza `docs/status.md` (compuerta de descarga).

## Problemas frecuentes
| Síntoma | Causa probable |
|---|---|
| `wg show` sin handshake | Falta la regla de la security list (paso 2) o el `Endpoint` está mal; revisa que la clave pública de cada lado sea la del otro |
| Handshake bien, `ping 10.8.0.2` falla | Falta la regla de ping del paso 5, o el PC está dormido |
| Ping bien, `check-proxy` da `Connection refused` | `gost` no corre: en PowerShell `Get-ScheduledTask pianola-home-proxy`; `Start-ScheduledTask pianola-home-proxy` |
| Funciona unos minutos y se corta | PC suspendido o falta `PersistentKeepalive` |
| `Sign in to confirm you're not a bot` por el proxy | También tu IP de casa está marcada; baja el ritmo (diez canciones suelen pasar) o usa el proxy residencial de respaldo (ADR 0004) |
| El contenedor no llega a `10.8.0.2` pero el host sí | `sudo iptables -L FORWARD -n` no debe tener un `REJECT` antes de las cadenas de Docker; reinicia Docker para que reinserte las suyas |
| Conflicto de red con `10.8.0.0/24` | Cambia la subred en las plantillas y en `-BindAddress`/`-VpsAddress`; la prueba `test_infra_wireguard.py` comprueba que ambos lados sigan coherentes |

## Seguridad
- Claves: cada máquina genera la suya; ninguna entra al repositorio ni a variables de CI. Si dudas de una, genera otra y repite pasos 1, 3 y 4.
- El proxy solo acepta conexiones desde `10.8.0.1` sobre el túnel; no hay autenticación adicional porque WireGuard ya autentica a la VPS con su clave.
- Quitar todo: `Uninstall-HomeProxy.ps1` (admin) y desactiva el túnel en la app. En la VPS: `sudo systemctl disable --now wg-quick@wg0`.
- Límite conocido: la prueba depende de que tu PC esté encendido. En la Fase 1 se decide si merece un proxy siempre activo o el respaldo de pago.
