#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Building nginx image..."
docker compose -f "$SCRIPT_DIR/compose.yaml" build nginx

echo "Restarting nginx..."
docker compose -f "$SCRIPT_DIR/compose.yaml" up -d --no-build --force-recreate

echo "Done!"
