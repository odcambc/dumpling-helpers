#!/usr/bin/env bash
# Day-to-day deploy: pull latest, install deps, rebuild frontends, reload services.
# Run as root (or via sudo) on the VPS.
#
#   sudo bash /srv/dumpling-helpers/deploy/scripts/deploy.sh

set -euo pipefail

REPO_DIR=/srv/dumpling-helpers
SVC_USER=dumpling

if [[ $EUID -ne 0 ]]; then
  echo "must run as root (use sudo)" >&2; exit 1
fi

cd "$REPO_DIR"

echo "==> git pull"
sudo -u $SVC_USER git pull --ff-only

echo "==> install deps (npm + uv)"
sudo -u $SVC_USER npm run install:all

echo "==> build frontends (dumpling + fusilli + stromboli)"
sudo -u $SVC_USER npm run build

echo "==> reload caddy (picks up new static files)"
systemctl reload caddy

echo "==> restart API service"
systemctl restart dumpling-wizard-api

echo ""
echo "==> deploy complete."
echo "tail logs:"
echo "  journalctl -u dumpling-wizard-api -f"
