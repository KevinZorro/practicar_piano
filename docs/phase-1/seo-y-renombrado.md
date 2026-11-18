# Buscadores y cambio de nombre (2026-11-18)

## Qué se hizo
- **Nombre**: el proyecto pasa a llamarse **Notacaida** («nota» + «caída», por las notas que caen). Es una palabra inventada: una búsqueda exacta entre comillas, en varios buscadores y en tiendas de apps, no devolvió ninguna página, marca ni app con ese nombre (2026-11-18). Sustituye a «Pianola», que usaban muchas páginas, y a «Teclario», que Kevin encontró que ya usaban otras. Se renombraron el paquete Python (`notacaida`), las variables `NOTACAIDA_*`, las imágenes Docker, Nginx, la interfaz y los documentos. El nombre de la base IndexedDB y el formato de exportación también cambian: la biblioteca guardada en el navegador con un nombre anterior no se migra (solo existía la de pruebas de Kevin).
- Se dejaron sin tocar los nombres operativos del túnel WireGuard y del proxy de casa (`infra/wireguard/home`, `infra/home-proxy`, `proxy-casa-wireguard.md`): viven en el PC de casa, no los ve ningún usuario y renombrarlos exigiría reinstalarlos.
- **SEO técnico** en `frontend/`: `index.html` con `title`, `description`, `canonical`, Open Graph, Twitter Card y datos estructurados `WebApplication` (JSON-LD); contenido HTML dentro de `#root` que ven los rastreadores sin JavaScript (React lo reemplaza); sección «Cómo funciona» en la portada; `public/robots.txt`, `public/sitemap.xml`, `favicon.svg` y `og-image.png`. Nginx comprime, cachea `/assets/` un año y no deja que `robots.txt`/`sitemap.xml` caigan en `index.html`.
- El dominio es parte del posicionamiento: `duckdns.org` es un sufijo compartido, pero un subdominio con el nombre de la marca (`notacaida.duckdns.org`) funciona. Todas las URL absolutas (canonical, sitemap, Open Graph) usan `https://notacaida.duckdns.org`.

## Migración en la VPS (una sola vez)
Orden: 1) DuckDNS, 2) esto desde la carpeta del repositorio en la VPS. Sirve tanto si la VPS aún está con el nombre original (`pianola`) como si ya pasó por `teclario`.

1. En duckdns.org crea el subdominio `notacaida` con la IP de la VPS (`curl -4 ifconfig.me`). Si DuckDNS dice que ya está cogido, avisa: se elige otro nombre. Comprueba que resuelve: `getent hosts notacaida.duckdns.org`.
2. En la VPS, desde `~/practicar_piano`:
```bash
git pull --ff-only origin main
D=notacaida.duckdns.org
OLD=pianola.duckdns.org                  # el dominio que sirve hoy la web
# variables de entorno (valen los prefijos antiguos)
sed -i -E 's/^(PIANOLA|TECLARIO)_/NOTACAIDA_/' infra/.env
# certificado nuevo (nginx parado un momento)
sudo systemctl stop nginx
sudo certbot certonly --standalone -d $D
# sitio nuevo con redirección 301 desde el dominio anterior
sudo cp infra/nginx/notacaida.conf /etc/nginx/sites-available/notacaida
sudo sed -i "s/notacaida.example.duckdns.org/$D/g" /etc/nginx/sites-available/notacaida
sudo tee -a /etc/nginx/sites-available/notacaida >/dev/null <<EOT

server {
    listen 80;
    listen 443 ssl http2;
    server_name $OLD;
    ssl_certificate     /etc/letsencrypt/live/$OLD/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$OLD/privkey.pem;
    return 301 https://$D\$request_uri;
}
EOT
sudo rm -f /etc/nginx/sites-enabled/*
sudo ln -sf /etc/nginx/sites-available/notacaida /etc/nginx/sites-enabled/notacaida
sudo nginx -t && sudo systemctl start nginx
# para los contenedores de cualquier nombre anterior (liberan el puerto 8000) y despliega
for P in pianola teclario; do docker compose -p $P -f infra/docker-compose.yml down --remove-orphans; done
bash infra/deploy.sh
```
3. Comprueba: `curl -s http://127.0.0.1:8000/healthz`, `curl -sI https://$D/robots.txt` (200, `text/plain`), `curl -s https://$D/sitemap.xml | head` y `curl -sI https://$OLD/` (301 hacia el nuevo).
4. Si usas el despliegue automático, el secreto/variable de la ruta no cambia; solo `/var/www/notacaida` es nuevo (lo crea `deploy.sh`). Si `deploy.sh` falla con «port is already allocated» (8000), es que un contenedor con un nombre anterior sigue vivo: repite el bucle `docker compose -p … down`.

## Registrar el sitio en Google Search Console
1. Entra en https://search.google.com/search-console con la cuenta de Google de Kevin → **Añadir propiedad**.
2. Elige **Prefijo de URL** (no «Dominio»: `duckdns.org` no es tuyo, así que no puedes verificar por DNS) e introduce `https://notacaida.duckdns.org/`.
3. Verificación: elige **Etiqueta HTML** y copia el valor de `content`. Luego, en `frontend/index.html`, añade dentro de `<head>`:
   `<meta name="google-site-verification" content="EL_VALOR" />`
   Haz commit (`chore(frontend): google site verification`), fusiona y ejecuta `bash infra/deploy.sh` en la VPS. Vuelve a Search Console y pulsa **Verificar**. (Alternativa: **Archivo HTML**: descarga `googleXXXX.html`, ponlo en `frontend/public/` y despliega.)
4. En **Sitemaps** escribe `sitemap.xml` y pulsa **Enviar** (estado «Correcto»).
5. En **Inspección de URLs** pega `https://notacaida.duckdns.org/` → **Probar URL publicada** → **Solicitar indexación**.
6. Espera de unos días a un par de semanas. Comprueba con `site:notacaida.duckdns.org` en Google. Con un sitio nuevo, ayuda tener enlaces entrantes: el README del repositorio (ya enlaza al sitio), tu perfil de GitHub y LinkedIn.
7. Opcional: Bing Webmaster Tools permite importar la propiedad desde Search Console.

## Límites honestos
- Nadie garantiza la posición en Google; esto deja el sitio rastreable, indexable y bien descrito. Un nombre inventado y poco usado ayuda a aparecer al buscar «Notacaida».
- La portada es una SPA: Google ejecuta JavaScript, y además el contenido básico está en el HTML inicial. Las pantallas de práctica y biblioteca no deben indexarse (dependen de datos locales).
