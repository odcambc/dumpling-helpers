#!/usr/bin/env bash
# Refresh ufw rules: allow 80/443 only from current Cloudflare IP ranges.
# Tag rules with the comment 'cf-edge' so we can find and replace them.
#
# Safe to run on a cron (weekly is plenty — CF ranges change rarely).
#
#   sudo bash /srv/dumpling-helpers/deploy/scripts/refresh-cf-ips.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "must run as root" >&2; exit 1
fi

echo "==> removing stale cf-edge rules"
# ufw status numbered renumbers as you delete, so process highest-number first.
while true; do
  N=$(ufw status numbered | awk -F'[][]' '/cf-edge/ {print $2}' | sort -rn | head -1)
  [[ -z "$N" ]] && break
  yes | ufw delete "$N" >/dev/null
done

echo "==> fetching current Cloudflare IP ranges"
TMP=$(mktemp -d)
curl -fsS https://www.cloudflare.com/ips-v4 -o "$TMP/v4"
curl -fsS https://www.cloudflare.com/ips-v6 -o "$TMP/v6"

echo "==> installing new rules"
while read -r CIDR; do
  [[ -z "$CIDR" ]] && continue
  ufw allow from "$CIDR" to any port 80,443 proto tcp comment 'cf-edge'
done < <(cat "$TMP/v4" "$TMP/v6")

rm -rf "$TMP"

echo "==> done."
ufw status numbered | grep -F 'cf-edge' | wc -l | xargs echo "cf-edge rules now active:"
