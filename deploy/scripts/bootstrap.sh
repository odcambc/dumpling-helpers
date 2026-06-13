#!/usr/bin/env bash
# One-shot VPS provisioning for the dumpling-helpers monorepo.
# Idempotent: safe to re-run.
#
# Usage (as root on a fresh Ubuntu 24.04 VPS):
#   curl -fsSL https://raw.githubusercontent.com/<you>/dumpling-helpers/main/deploy/scripts/bootstrap.sh | bash
# Or after cloning:
#   sudo bash deploy/scripts/bootstrap.sh
#
# Required env (export before running, or fill in defaults below):
#   YOUR_SSH_IP   — your home/office IP, allowed to SSH in
#   REPO_URL      — git URL to clone

set -euo pipefail

YOUR_SSH_IP="${YOUR_SSH_IP:?set YOUR_SSH_IP, e.g. 203.0.113.10}"
REPO_URL="${REPO_URL:-https://github.com/cbmacdo/dumpling-helpers.git}"
REPO_DIR=/srv/dumpling-helpers
SVC_USER=dumpling

if [[ $EUID -ne 0 ]]; then
  echo "must run as root" >&2; exit 1
fi

echo "==> apt update + base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg lsb-release ufw git build-essential

echo "==> install caddy (official repo)"
if ! command -v caddy >/dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

echo "==> install node 20.x (NodeSource)"
if ! command -v node >/dev/null || ! node -v | grep -q '^v20'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "==> install uv (system-wide)"
if ! command -v uv >/dev/null; then
  UV_INSTALL_DIR=/usr/local/bin curl -LsSf https://astral.sh/uv/install.sh | sh
fi

echo "==> create $SVC_USER user"
if ! id -u $SVC_USER >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin $SVC_USER
fi

echo "==> clone repo to $REPO_DIR"
if [[ ! -d $REPO_DIR/.git ]]; then
  git clone "$REPO_URL" "$REPO_DIR"
  chown -R $SVC_USER:$SVC_USER "$REPO_DIR"
fi

echo "==> configure ufw (SSH from $YOUR_SSH_IP only)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$YOUR_SSH_IP" to any port 22 proto tcp comment 'ssh-admin'
# 80/443 rules added by refresh-cf-ips.sh
bash "$REPO_DIR/deploy/scripts/refresh-cf-ips.sh"
ufw --force enable

echo "==> install systemd units"
install -m 0644 "$REPO_DIR/deploy/systemd/dumpling-wizard-api.service" /etc/systemd/system/
systemctl daemon-reload

echo ""
echo "==> bootstrap complete."
echo ""
echo "Next steps (manual):"
echo "  1. Drop the Cloudflare Origin Certificate at:"
echo "       /etc/caddy/origin.pem  (cert)"
echo "       /etc/caddy/origin.key  (key, mode 0640, group caddy)"
echo "  2. Copy deploy/.env.example to /etc/caddy/Caddyfile.env, fill in hosts."
echo "  3. Install the Caddyfile:"
echo "       cp $REPO_DIR/deploy/caddy/Caddyfile /etc/caddy/Caddyfile"
echo "  4. First deploy:"
echo "       sudo bash $REPO_DIR/deploy/scripts/deploy.sh"
echo "  5. Enable services:"
echo "       systemctl enable --now caddy dumpling-wizard-api"
