# Runbook: prueba de la Fase 0 en la VPS (compuerta 1)

Objetivo: decidir con diez covers reales si (1) la VPS puede bajar el audio de YouTube y (2) algún modelo transcribe de forma reconocible y a tiempo en 2 OCPU. Tiempo estimado: entre 8 y 12 horas contando la preparación y la escucha.

## Criterios de la compuerta

| Criterio | Cómo se mide |
| --- | --- |
| Al menos **8 de 10** canciones reconocibles | De oído, por modelo: escuchas el WAV y anotas `si` o `no` en `verdicts.csv` |
| **Menos de 2 min** de proceso por canción de 3 min | Automático: tiempo de inferencia ÷ duración < 0,67 en todas las canciones |
| La descarga funciona, directa o por la casa | Automático: el informe cuenta las descargas correctas |

Resultado de `teclario phase0 gate`:

| Estado | Significa | Qué hacer |
| --- | --- | --- |
| `PASS` | Un mismo modelo cumple reconocimiento y tiempo | Seguir a la Fase 1 con ese modelo; actualizar ADR 0006 |
| `PARTIAL` | Hay 8 canciones reconocibles pero ningún modelo cumple ambas cosas | Avisar: se decide entre más hardware, un modelo más rápido o bajar el alcance |
| `FAIL` | Menos de 8 reconocibles | Plan del estudio: si falla la descarga, la entrada vuelve a ser un archivo; si falla el modelo, herramienta de práctica con MIDI y retroceso |
| `INCOMPLETE` | Faltan canciones o veredictos | Completar y volver a correr `gate` |

Código de salida: 0 = PASS, 1 = PARTIAL o FAIL, 2 = INCOMPLETE o error de uso.

## 1. Elegir los diez covers

- Piano solo, bien grabado, sin voz ni otros instrumentos (el MVP se limita a eso).
- Duración cercana a 3 minutos (entre 2 y 5). Ninguno de más de 10 minutos (límite de seguridad).
- Variedad: una balada lenta, una pieza rápida, una con mucho pedal, una con acordes densos, una con melodía clara y acompañamiento simple.
- Solo enlaces de audio que tengas derecho a usar (ver términos en ADR 0004).

Crea `links.txt` en la raíz del repositorio, **antes** de correr `docker compose run` (si no existe, Docker crea una carpeta con ese nombre; bórrala con `rmdir links.txt`). Está ignorado por git porque contiene canciones protegidas. La etiqueta puede llevar `|`: el enlace es lo que sigue al último `|`.

```
# etiqueta | enlace
Balada lenta | https://www.youtube.com/watch?v=XXXXXXXXXXX
https://youtu.be/YYYYYYYYYYY
```

## 2. Preparar la VPS

Ubuntu ARM64. Si `docker` no existe, instálalo desde el repositorio oficial (trae `compose` y `buildx`) y añade tu usuario al grupo `docker`:

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo ${UBUNTU_CODENAME:-$VERSION_CODENAME}) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker
docker run --rm hello-world
```

Después:

```bash
git clone https://github.com/KevinZorro/practicar_piano.git && cd practicar_piano
git checkout <rama o tag de la Fase 0>
export HOST_UID=$(id -u) HOST_GID=$(id -g)
mkdir -p phase0-output phase0-models
docker compose -f infra/docker-compose.yml build      # 10 a 20 minutos la primera vez
```

## 3. Descargar el checkpoint de ByteDance (verificado)

```bash
docker compose -f infra/docker-compose.yml run --rm \
  --entrypoint /app/scripts/fetch_bytedance_checkpoint.sh phase0
```

La primera vez imprime el SHA-256 y avisa que no hay hash fijado. Contrasta el archivo con el checksum que muestra la página del registro de Zenodo, copia el hash a `backend/scripts/bytedance_checkpoint.sha256` y haz commit. Mientras estés en esa página, lee y anota la **licencia del checkpoint** en `docs/phase-0/model-licenses.md` (ver ADR 0013).

## 4. Correr la prueba

```bash
docker compose -f infra/docker-compose.yml run --rm phase0 phase0 run \
  --links /data/links.txt --out /data/out
```

- Procesa las canciones una por una; cada modelo corre en su propio proceso para medir bien su memoria.
- No corras otras cargas pesadas en la VPS durante la prueba: falsean los tiempos.
- Borra el audio de cada canción al terminar, aunque algo falle.
- Salidas en `phase0-output/`: `NN-<huella>/basic-pitch.{mid,wav}`, `.../bytedance.{mid,wav}`, `results.json`, `report.md` y `verdicts.csv`. **No se versionan**: son derivadas de canciones protegidas.

### Si YouTube bloquea la descarga

El error típico es `Sign in to confirm you're not a bot` en el informe. Plan B del ADR 0004: sacar la descarga por la conexión de tu casa.

Sigue el paso a paso en [`proxy-casa-wireguard.md`](proxy-casa-wireguard.md): WireGuard con la VPS como servidor, proxy SOCKS5 en tu PC de casa y verificación con `check-tunnel.sh`. Con el túnel arriba, corre con la variable (el valor nunca se imprime ni se guarda):

```bash
TECLARIO_PROXY_URL=socks5h://10.8.0.2:1080 \
docker compose -f infra/docker-compose.yml run --rm phase0 phase0 run \
  --links /data/links.txt --out /data/out
```

Apunta en el informe si usaste proxy (`download: via proxy` aparece en el entorno del informe). Un proxy residencial de pago es el respaldo si tu conexión también es bloqueada.

### Plan B: audio que ya tienes (si la descarga está bloqueada)

El estudio prevé este respaldo: la entrada vuelve a ser un archivo. Sirve para evaluar los modelos sin depender de la descarga (la pregunta de la descarga se cierra aparte con el proxy).

1. En tu computador (la IP de casa suele funcionar), baja el audio de cada canción, por ejemplo con yt-dlp: `yt-dlp -x --audio-format wav -o "%(autonumber)02d - %(title)s.%(ext)s" <enlace>`. Sirve cualquier formato de audio (wav, mp3, m4a, opus, flac...).
2. Súbelos a la VPS: `scp *.wav ubuntu@<vps>:~/practicar_piano/phase0-audio/` (la carpeta está ignorada por git).
3. Corre con `--audio-dir`; el orden alfabético de los archivos es el número de canción y el nombre del archivo es la etiqueta:

```bash
mkdir -p phase0-audio
docker compose -f infra/docker-compose.yml run --rm phase0 phase0 run \
  --audio-dir /data/audio --out /data/out
```

Tus archivos originales nunca se tocan: se convierte una copia temporal que se borra al terminar. El informe indica `audio: local files (no download)`, así que la compuerta de la descarga queda **sin cerrar** hasta probar el proxy.

## 5. Escuchar y decidir

1. Copia los WAV a tu computador: `scp -r vps:practicar_piano/phase0-output .`
2. Para cada canción y modelo, escucha un fragmento y compáralo de memoria con el original. **Reconocible** = alguien que conoce la canción la identificaría por la melodía sin que se lo digas. Anota `si` o `no` en `verdicts.csv` (acepta también `yes`, `1`, `true`).
3. Copia `verdicts.csv` a la VPS (o corre `gate` donde esté) y aplica la compuerta:

```bash
docker compose -f infra/docker-compose.yml run --rm phase0 phase0 gate --out /data/out
```

Esto reescribe `report.md` con el resultado.

## 6. Leer el informe

- **Inferencia s**: tiempo del modelo ya cargado; es el de la compuerta, porque el servidor cargará los modelos una vez al arrancar.
- **Total s**: incluye cargar el modelo (arranque en frío); sirve para dimensionar el primer arranque.
- **Memoria MB**: pico del proceso de cada modelo. La VPS tiene 12 GB; con una canción a la vez sobra margen si el pico es menor a unos 6 GB.
- **Factor**: inferencia ÷ duración; el presupuesto es 0,67.

## 7. Al terminar

1. Pega las cifras clave en `docs/status.md` y actualiza ADR 0006 (estado Aceptada o Reemplazada) con el modelo elegido y el porqué.
2. Completa `docs/phase-0/model-licenses.md` y, si hace falta, corrige `NOTICE` y el ADR 0012.
3. Borra `phase0-output/` de la VPS si no lo necesitas: contiene MIDI y WAV de canciones protegidas.
4. Avisa a Kevin del resultado de la compuerta antes de empezar la Fase 1.

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `required tools not found on PATH: deno` | Se corrió fuera de Docker sin Deno | Usar la imagen o instalar Deno |
| `Sign in to confirm you're not a bot` | YouTube bloquea la IP de la VPS | Proxy por WireGuard (sección 4) |
| `checkpoint not found or incomplete` | Falta el paso 3 | Descargar el checkpoint |
| `worker died with exit code -9` | Sin memoria (OOM) | Revisar el pico de memoria del otro modelo; canción demasiado larga |
| Fallos de extracción repentinos | yt-dlp desactualizado frente a YouTube | `cd backend && uv lock --upgrade-package yt-dlp`, reconstruir la imagen |

## Sin Docker (alternativa)

```bash
cd backend && uv sync --python 3.11 --extra synth --extra basic-pitch --extra bytedance
uv run teclario phase0 run --links ../links.txt --out ../phase0-output
```

Necesita `ffmpeg` y `deno` en el `PATH`.
