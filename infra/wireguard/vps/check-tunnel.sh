#!/usr/bin/env bash
# Verify the tunnel and the home proxy, from the VPS host and from a container.
# Usage: ./check-tunnel.sh   (optional: PROXY_HOST, PROXY_PORT)
# The URL checked is YouTube's home page, never a song link.
set -uo pipefail

host="${PROXY_HOST:-10.8.0.2}"
port="${PROXY_PORT:-1080}"
proxy="socks5h://${host}:${port}"
fail=0
step() { printf '%-46s' "$1"; }
ok() { echo OK; }
ko() { echo FAIL; fail=1; }

step "1. WireGuard handshake with the home PC"
if sudo wg show wg0 latest-handshakes 2>/dev/null | awk '{ if ($2 > 0) found=1 } END { exit !found }'; then ok; else ko; fi

step "2. ping ${host} through the tunnel"
if ping -c 2 -W 3 "$host" >/dev/null 2>&1; then ok; else ko; fi

step "3. SOCKS5 proxy reaches YouTube (host)"
if curl -sS -o /dev/null --max-time 20 --proxy "$proxy" -I https://www.youtube.com; then ok; else ko; fi

step "4. Same, from a container (compose path)"
if docker run --rm --entrypoint curl "${TECLARIO_IMAGE:-teclario-phase0:local}" \
  -sS -o /dev/null --max-time 20 --proxy "$proxy" -I https://www.youtube.com 2>/dev/null; then ok; else ko; fi

step "5. Exit IP is the home IP, not the VPS IP"
home_ip="$(curl -sS --max-time 20 --proxy "$proxy" https://api.ipify.org 2>/dev/null)"
vps_ip="$(curl -sS --max-time 20 https://api.ipify.org 2>/dev/null)"
if [ -n "$home_ip" ] && [ "$home_ip" != "$vps_ip" ]; then ok; else ko; fi

exit "$fail"
