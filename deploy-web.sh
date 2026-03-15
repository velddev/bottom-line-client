#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# SSL certs must exist at nginx/ssl/server.crt and nginx/ssl/server.key
if [[ ! -f "$SCRIPT_DIR/nginx/ssl/server.crt" || ! -f "$SCRIPT_DIR/nginx/ssl/server.key" ]]; then
  echo "ERROR: SSL certificates not found."
  echo "Place your certificates at:"
  echo "  nginx/ssl/server.crt"
  echo "  nginx/ssl/server.key"
  exit 1
fi

echo "Building web images..."
docker compose -f "$SCRIPT_DIR/compose.yaml" build

echo "Restarting web stack..."
docker compose -f "$SCRIPT_DIR/compose.yaml" up -d --force-recreate

echo "Done!"
