# Infra

- `docker-compose.yml` (added with the Dockerfile): runs the Phase 0 benchmark image.
- Nginx + HTTPS (DuckDNS / Let's Encrypt) arrive in Phase 1 (D-03, D-11).
- `wireguard/` and `home-proxy/`: optional home proxy over WireGuard for yt-dlp (ADR 0014); steps in `docs/phase-0/proxy-casa-wireguard.md`.
