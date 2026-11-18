#!/usr/bin/env bash
# Open UDP 51820 in the VPS host firewall (idempotent). Run as root.
# Oracle Ubuntu images ship iptables rules that end in a REJECT, so the ACCEPT must be
# inserted before it (-I), not appended. The OCI security list is a separate layer: see
# docs/phase-0/proxy-casa-wireguard.md.
set -euo pipefail

port="${WG_PORT:-51820}"
rule=(INPUT -p udp --dport "$port" -m comment --comment teclario-wireguard -j ACCEPT)

if iptables -C "${rule[@]}" 2>/dev/null; then
  echo "firewall: UDP ${port} already open"
else
  iptables -I "${rule[@]}"
  echo "firewall: UDP ${port} opened"
fi

# Persist across reboots (iptables-persistent / netfilter-persistent on Ubuntu).
if command -v netfilter-persistent >/dev/null; then
  netfilter-persistent save >/dev/null
else
  echo "firewall: install iptables-persistent to keep the rule after a reboot" >&2
fi
