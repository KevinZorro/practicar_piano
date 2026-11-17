# Despliegue de la Fase 1 en la VPS

Pasos para publicar la API y el frontend en la VPS de Oracle (Ubuntu, arm64). Todo esto está **sin verificar**: no se puede probar en la nube, así que la primera vez conviene ir paso a paso y mirar los registros.

## 1. Requisitos (ya cumplidos en la Fase 0)
- Docker con el plugin de compose, el repositorio clonado y `phase0-models/` con el checkpoint de ByteDance (`backend/scripts/fetch_bytedance_checkpoint.sh`).
- Proxy de casa por WireGuard funcionando si YouTube bloquea la VPS (`docs/phase-0/proxy-casa-wireguard.md`). El valor va en `infra/.env`: `PIANOLA_PROXY_URL=socks5h://10.8.0.2:1080`.

## 2. Levantar la API
```bash
cd ~/practicar_piano && git pull
export HOST_UID=$(id -u) HOST_GID=$(id -g)
docker compose -f infra/docker-compose.yml up -d --build api
docker compose -f infra/docker-compose.yml ps          # api debe quedar «healthy»
curl -fsS http://127.0.0.1:8000/healthz                 # {"status":"ok"}
```
La primera construcción tarda: instala torch y los modelos para arm64.

## 3. Construir el frontend
```bash
# Desde la raíz del repo. Usa Docker, así la VPS no necesita Node.
docker run --rm --user $(id -u):$(id -g) -e HOME=/tmp -v "$PWD/frontend":/app -w /app node:22 sh -c "npm ci && npm run build"
sudo mkdir -p /var/www/pianola && sudo rsync -a --delete frontend/dist/ /var/www/pianola/
```

## 4. Dominio, Nginx y HTTPS
El HTTPS es obligatorio (notificaciones y Web MIDI exigen contexto seguro). Con DuckDNS es gratis:
1. En duckdns.org crea un subdominio y apúntalo a la IP pública de la VPS (`curl -4 ifconfig.me`).
2. Abre los puertos 80 y 443 en la lista de seguridad de Oracle y en `ufw`/`iptables` de la VPS.
3. Pide el certificado antes de activar el bloque 443 (si no, `nginx -t` falla):
```bash
D=TU.duckdns.org
sudo apt-get install -y nginx certbot
sudo systemctl stop nginx
sudo certbot certonly --standalone -d $D
sudo cp infra/nginx/pianola.conf /etc/nginx/sites-available/pianola
sudo sed -i "s/pianola.example.duckdns.org/$D/g" /etc/nginx/sites-available/pianola
sudo ln -sf /etc/nginx/sites-available/pianola /etc/nginx/sites-enabled/pianola
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl start nginx
```

## 5. Prueba de punta a punta
1. Abre `https://TU-DOMINIO.duckdns.org`, pega el enlace de un cover de unos 3 minutos y pulsa **Procesar canción**.
2. Debe aparecer «posición 1» y, tras unos 6–7 minutos, «¡Lista!» (y la notificación del navegador).
3. Pulsa **Practicar**: caen las notas y la partitura tiene cursor. La canción queda en «Mi biblioteca».
4. En la VPS: `docker compose -f infra/docker-compose.yml logs api | tail -50`. No debe salir ningún enlace de YouTube; si sale, es un error a reportar.

## 6. Si algo falla
| Síntoma | Qué mirar |
|---|---|
| El trabajo termina en `download_failed` | El proxy (`docker compose ... run --rm check-proxy`) y la versión de yt-dlp |
| `internal_error` | `logs api`: solo se registra el tipo de excepción; suele ser el checkpoint ausente o poca memoria |
| La página carga pero `/api` da 502 | `docker compose ps` (¿api healthy?) y `curl 127.0.0.1:8000/healthz` |
| El estado no se actualiza | Nginx con `proxy_buffering off` en `/api/` (ya incluido) |
| Todos los usuarios cuentan como una IP | `PIANOLA_TRUST_PROXY=true` y Nginx con `X-Real-IP` (ya incluido) |

## Límites conocidos
La cola y los resultados viven en memoria: reiniciar el contenedor pierde los trabajos en curso (ADR 0016). Un proceso a la vez; el límite de memoria del contenedor es 10 GB de los 12 de la VPS.
