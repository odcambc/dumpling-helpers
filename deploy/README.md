# Deploying dumpling-helpers

This directory holds everything needed to host the dumpling-helpers suite on a
single Hetzner VPS, behind Cloudflare, with a removable Cloudflare Access gate.

The suite is one app: the config wizard at `/`, with the QC tools as routes
(`/oligo-validator`, `/library-composition`, `/sequencing-plan`).

See `.claude/plans/toolsuite-plan.md` → Phase 6 for the full design and the
rationale behind each choice.

## Architecture at a glance

```
Browser → Cloudflare (TLS + Access gate + WAF + rate limit)
        → VPS (ufw: 80/443 from CF IPs only)
        → Caddy (TLS via CF Origin Cert)
            └─ wizard.<domain>  → uvicorn :8000 + /apps/dumpling/frontend/dist
                                  (wizard at /, QC tools at /oligo-validator,
                                   /library-composition, /sequencing-plan)
```

## Layout

```
deploy/
  caddy/dumpling-helpers.caddy  — vhost snippet (NOT a full Caddyfile; meant to be imported)
  systemd/                      — the FastAPI backend unit
  scripts/
    bootstrap.sh                — first-time VPS provisioning (greenfield only)
    deploy.sh                   — day-to-day pull+build+reload
    refresh-cf-ips.sh           — re-sync ufw with CF IP ranges
  .env.example                  — hostname Caddy reads from /etc/caddy/Caddyfile.env
```

## Coexisting with an existing Caddy on the VPS

This VPS already runs Caddy for other apps. Our config is a **vhost snippet**, not a full Caddyfile — it adds one site block alongside whatever's already there. One Caddy process, multiple vhosts.

The setup steps below assume:
- Caddy, Node, uv, git are already installed on the box.
- A `dumpling` service user does not yet exist.
- ufw is already configured for the other apps; we'll *add* rules, not reset.
- The existing Caddyfile uses Let's Encrypt for its own vhosts and we will not interfere with that.

**Skip `bootstrap.sh`** — it assumes a fresh box and would reset ufw + reinstall Caddy. Run the targeted steps in "Wire into existing Caddy" below instead.

## First-time setup

### 1. Cloudflare

1. Add domain to Cloudflare; nameservers must point at CF.
2. **DNS** → A record `wizard` → VPS IPv4, **proxied** (orange cloud).
3. **SSL/TLS** → Overview → "Full (strict)".
4. **SSL/TLS** → Origin Server → create Origin Certificate for `*.<domain>` and `<domain>`. Download the cert + key — they go on the VPS in step 4.
5. **Zero Trust** → Access → Applications → create one self-hosted app for `wizard.<domain>`. Policy: email allowlist. (This is the **interim gate** — see "Going public" below.)
6. **Security** → WAF → enable managed rules (Free tier).
7. **Security** → WAF → Rate limiting → 100 req/min per IP, pattern `*.<domain>/api/*`.

### 2. VPS: targeted install (existing Caddy already present)

As root on the VPS:

```sh
# Create the service user (no-login system account with a homedir for uv cache)
useradd --system --create-home --shell /usr/sbin/nologin dumpling

# Clone repo
git clone https://github.com/cbmacdo/dumpling-helpers.git /srv/dumpling-helpers
chown -R dumpling:dumpling /srv/dumpling-helpers

# Add CF IP ranges to ufw (additive — leaves existing rules in place)
bash /srv/dumpling-helpers/deploy/scripts/refresh-cf-ips.sh

# Install the systemd unit for the FastAPI backend
install -m 0644 /srv/dumpling-helpers/deploy/systemd/dumpling-wizard-api.service /etc/systemd/system/
systemctl daemon-reload
```

### 3. Drop the Cloudflare Origin Cert on the VPS

```sh
install -m 0644 -o root -g caddy /path/to/origin.pem /etc/caddy/origin.pem
install -m 0640 -o root -g caddy /path/to/origin.key /etc/caddy/origin.key
```

### 4. Wire into existing Caddy

```sh
# 1. Install the vhost snippet
mkdir -p /etc/caddy/conf.d
install -m 0644 /srv/dumpling-helpers/deploy/caddy/dumpling-helpers.caddy /etc/caddy/conf.d/

# 2. Install env file with the hostname
cp /srv/dumpling-helpers/deploy/.env.example /etc/caddy/Caddyfile.env
$EDITOR /etc/caddy/Caddyfile.env             # fill in the real hostname

# 3. Make sure systemd passes the env file to Caddy
mkdir -p /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/env.conf <<'EOF'
[Service]
EnvironmentFile=/etc/caddy/Caddyfile.env
EOF
systemctl daemon-reload

# 4. Edit /etc/caddy/Caddyfile and add ONE line near the top, after the
#    global options block (or at the bottom if there's no global block):
#
#        import /etc/caddy/conf.d/*.caddy
#
#    Skip this step if the existing Caddyfile already has it.

# 5. Validate before reloading — catches typos before they take production down
caddy validate --config /etc/caddy/Caddyfile

# 6. Reload (zero-downtime — existing vhosts keep serving)
systemctl reload caddy
```

### 5. First deploy

```sh
sudo bash /srv/dumpling-helpers/deploy/scripts/deploy.sh
systemctl enable --now dumpling-wizard-api
```

(Caddy is already running and was reloaded in step 4 — no `enable` needed.)

### 6. Smoke test

```sh
# Should 302 to a CF Access login page (proves gate is working):
curl -sSI https://wizard.<your-domain>/api/health | head

# After CF Access login in a browser, the app should load — wizard at / and
# the QC tools at their routes.

# Should fail to connect (proves origin is locked down):
curl --resolve wizard.<your-domain>:443:<vps-ip> https://wizard.<your-domain>/api/health
```

## Day-to-day deploy

```sh
ssh <vps>
sudo bash /srv/dumpling-helpers/deploy/scripts/deploy.sh
```

## Going public

When ready to open the app to the world:

1. **Cloudflare** → Zero Trust → Access → Applications → delete the `wizard.<domain>` app.
2. Verify abuse controls are still in place:
   - Rate limiting rule active (100 req/min per IP on `/api/*`).
   - WAF managed rules enabled.
3. Tail logs for a few hours after announcing — `journalctl -u dumpling-wizard-api -f`.

That's the whole switch. The architecture doesn't change; only the Access policy is removed.

## Refreshing Cloudflare IP ranges

The `ufw` rules limit 80/443 to current CF IPs. These change rarely but do change. Run weekly via cron:

```sh
# /etc/cron.weekly/refresh-cf-ips
#!/bin/sh
/srv/dumpling-helpers/deploy/scripts/refresh-cf-ips.sh > /var/log/cf-ips.log 2>&1
```

## Common failures

- **502 from Caddy** — backend isn't running. Check `journalctl -u dumpling-wizard-api`.
- **Blank page** — `npm run build` produced no `dist/` (look for build errors in `deploy.sh` output).
- **521 from Cloudflare** — Origin Cert mismatched or CF can't reach VPS. Check `ufw status` includes current CF ranges.
- **Apps load locally but external `curl` 521s** — SSL mode isn't "Full (strict)" or origin cert is for the wrong hostname.
