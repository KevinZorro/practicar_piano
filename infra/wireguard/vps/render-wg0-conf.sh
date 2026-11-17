#!/usr/bin/env bash
# Render wg0.conf from the template to stdout.
# Usage: render-wg0-conf.sh <server-private-key-file> <home-public-key>
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
key_file="${1:?usage: $0 <server-private-key-file> <home-public-key>}"
home_pub="${2:?usage: $0 <server-private-key-file> <home-public-key>}"

# A WireGuard key is 32 bytes in base64: 43 characters plus one '='.
key_re='^[A-Za-z0-9+/]{43}=$'
server_priv="$(tr -d '[:space:]' <"$key_file")"
[[ "$server_priv" =~ $key_re ]] || { echo "server private key is not a valid WireGuard key" >&2; exit 1; }
[[ "$home_pub" =~ $key_re ]] || { echo "home public key is not a valid WireGuard key" >&2; exit 1; }

# Base64 contains '/' and '+', so use '|' as the sed delimiter ('|' is not in the alphabet).
sed -e "s|@SERVER_PRIVATE_KEY@|${server_priv}|" \
    -e "s|@HOME_PUBLIC_KEY@|${home_pub}|" \
    "$here/wg0.conf.template"
