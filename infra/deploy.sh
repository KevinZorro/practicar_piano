#!/usr/bin/env bash
# One-command deploy, run ON the VPS from anywhere: bash infra/deploy.sh
# Pulls main, rebuilds the API container, rebuilds the frontend with Docker and publishes it.
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="${DEPLOY_BRANCH:-main}"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# The VPS disk is small and image builds leave layers behind: free what nothing uses first.
docker image prune -f >/dev/null
docker builder prune -f --filter until=24h >/dev/null
df -h / | tail -1

export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
docker compose -f infra/docker-compose.yml up -d --build api

docker run --rm --user "$HOST_UID:$HOST_GID" -e HOME=/tmp \
  -v "$PWD/frontend":/app -w /app node:22 sh -c "npm ci && npm run build"
sudo mkdir -p /var/www/teclario
sudo rsync -a --delete frontend/dist/ /var/www/teclario/

# wait for the API to answer (the container reports healthy after the models load)
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8000/healthz >/dev/null; then
    docker image prune -f >/dev/null
    echo "Deploy OK: $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
done
echo "The API did not answer /healthz; check: docker compose -f infra/docker-compose.yml logs api" >&2
exit 1
