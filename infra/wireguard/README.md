# WireGuard: VPS to home proxy

Optional path for yt-dlp when YouTube blocks the VPS (ADR 0004, ADR 0014).

```
 container (yt-dlp) -> VPS wg0 10.8.0.1 ==WireGuard/UDP 51820==> home PC wg 10.8.0.2:1080 (SOCKS5) -> YouTube
```

| Path | What |
|---|---|
| `vps/wg0.conf.template` | Server config; keys are injected on the VPS, never stored here |
| `vps/setup-vps.sh` | Installs WireGuard, generates the server key, opens the port, starts the tunnel |
| `vps/render-wg0-conf.sh` | Renders the template (validates keys; unit-tested) |
| `vps/firewall.sh` | Idempotent iptables rule for UDP 51820 |
| `vps/check-tunnel.sh` | Five-step diagnostic from the VPS |
| `home/pianola-home.conf.example` | Client config for the home PC (split tunnel) |
| `../home-proxy/windows/` | SOCKS5 proxy (gost) bound to the tunnel address, as a start-up task |

Step by step: `docs/phase-0/proxy-casa-wireguard.md`.
