#!/usr/bin/env bash
# Set up the WireGuard server on the VPS. Run as root (sudo) from the repository.
# Usage: sudo HOME_PUBLIC_KEY='<public key of the home PC>' ./setup-vps.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
home_pub="${HOME_PUBLIC_KEY:?set HOME_PUBLIC_KEY to the public key shown by WireGuard on the home PC}"
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wireguard iptables-persistent

install -d -m 700 /etc/wireguard
if [ ! -s /etc/wireguard/server.key ]; then
  (umask 077 && wg genkey >/etc/wireguard/server.key)
fi
wg pubkey </etc/wireguard/server.key >/etc/wireguard/server.pub

(umask 077 && "$here/render-wg0-conf.sh" /etc/wireguard/server.key "$home_pub" >/etc/wireguard/wg0.conf)
"$here/firewall.sh"

systemctl enable --now wg-quick@wg0
systemctl restart wg-quick@wg0

echo
echo "Server public key (paste it into the home PC tunnel, [Peer] PublicKey):"
cat /etc/wireguard/server.pub
