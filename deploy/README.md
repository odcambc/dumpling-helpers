# Deploying dumpling-helpers

This directory holds everything needed to host the dumpling-helpers tools on a
single Hetzner VPS, behind Cloudflare, with a removable Cloudflare Access gate.

The suite is three tools, one per subdomain:

- **dumpling** — the DMS config wizard, with a FastAPI backend (`/api` → `:8000`).
- **fusilli** — fusion-pipeline config wizard. Frontend-only (client-side).
- **stromboli** — barcode-mapping config wizard. Frontend-only (client-side).

See `.claude/plans/toolsuite-plan.md` → Phase 6 for the original design.

## Architecture at a glance

```
Browser → Cloudflare (TLS + Access gate + WAF + rate limit)
        → VPS (ufw: 80/443 from CF IPs only)
        → Caddy (TLS via one *.<domain> CF Origin Cert)
            ├─ dumpling.<domain>   → uvicorn :8000  + apps/dumpling/frontend/dist
            ├─ fusilli.<domain>    → (static)         apps/fusilli/frontend/dist
            └─ stromboli.<domain>  → (static)         apps/stromboli/frontend/dist
```

Only dumpling has a backend; fusilli and stromboli are static SPAs with no `/api`.

## Layout

```
deploy/
  caddy/dumpling-helpers.caddy  — vhost snippet, 3 site blocks (NOT a full Caddyfile)
  systemd/                      — dumpling's FastAPI backend unit (the only backend)
  scripts/
    bootstrap.sh                — first-time VPS provisioning (greenfield only)
    deploy.sh                   — day-to-day pull+build+reload
    refresh-cf-ips.sh           — re-sync ufw with CF IP ranges
  .env.example                  — the three hostnames Caddy reads from /etc/caddy/Caddyfile.env
```

## Cross-tool links (build-time)

The SOUS-CHEF "Switch tool" menu links between the three apps. Since each app is
served from its own subdomain, the links can't be relative — every frontend is
built knowing the others' URLs via `VITE_DUMPLING_URL` / `VITE_FUSILLI_URL` /
`VITE_STROMBOLI_URL` (see `.env.example`). Vite **inlines** these at build time,
so they must be exported in the environment when `deploy.sh` runs `npm run build`
— Caddy does not read them at runtime. If unset, the apps fall back to
`localhost:5173/5174/5175`, which is only correct for local dev. Set them to the
real `https://…` hostnames (matching `*_HOST`) before building for production.

## Coexisting with an existing Caddy on the VPS

This VPS already runs Caddy for other apps. Our config is a **vhost snippet**, not a full Caddyfile — it adds three site blocks alongside whatever's already there. One Caddy process, multiple vhosts.

The setup steps below assume:
- Caddy, Node, uv, git are already installed on the box.
- A `dumpling` service user does not yet exist.
- ufw is already configured for the other apps; we'll *add* rules, not reset.
- The existing Caddyfile uses Let's Encrypt for its own vhosts and we will not interfere with that.

**Skip `bootstrap.sh`** — it assumes a fresh box and would reset ufw + reinstall Caddy. Run the targeted steps in "Wire into existing Caddy" below instead.

## First-time setup

### 1. Cloudflare

1. Add domain to Cloudflare; nameservers must point at CF.
2. **DNS** → A records `dumpling`, `fusilli`, `stromboli` → VPS IPv4, all **proxied** (orange cloud).
3. **SSL/TLS** → Overview → "Full (strict)".
4. **SSL/TLS** → Origin Server → create one Origin Certificate for `*.<domain>` and `<domain>` (covers all three subdomains). Download the cert + key — they go on the VPS in step 3.
5. **Zero Trust** → Access → Applications → create a self-hosted app for each of `dumpling.<domain>`, `fusilli.<domain>`, `stromboli.<domain>`. Policy: email allowlist. (The **interim gate** — see "Going public".)
6. **Security** → WAF → enable managed rules (Free tier).
7. **Security** → WAF → Rate limiting → 100 req/min per IP, pattern `dumpling.<domain>/api/*` (only dumpling has an API).

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

# Install the systemd unit for dumpling's FastAPI backend (the only backend)
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

# 2. Install env file with the three hostnames
cp /srv/dumpling-helpers/deploy/.env.example /etc/caddy/Caddyfile.env
$EDITOR /etc/caddy/Caddyfile.env             # fill in the real hostnames

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
# dumpling has an API — should 302 to a CF Access login page (proves gate is up):
curl -sSI https://dumpling.<your-domain>/api/health | head

# After CF Access login in a browser, all three should load:
#   https://dumpling.<your-domain>   https://fusilli.<your-domain>   https://stromboli.<your-domain>

# Should fail to connect (proves the origin is locked to Cloudflare):
curl --resolve dumpling.<your-domain>:443:<vps-ip> https://dumpling.<your-domain>/api/health
```

## Day-to-day deploy

```sh
ssh <vps>
sudo bash /srv/dumpling-helpers/deploy/scripts/deploy.sh
```

`deploy.sh` builds all three frontends (`npm run build`) and restarts dumpling's
backend. fusilli and stromboli have no service to restart — their new `dist/` is
served as soon as Caddy reloads.

## Going public

When ready to open the tools to the world:

1. **Cloudflare** → Zero Trust → Access → Applications → delete the `dumpling.<domain>`, `fusilli.<domain>`, and `stromboli.<domain>` apps.
2. Verify abuse controls are still in place:
   - Rate limiting rule active (100 req/min per IP on `dumpling.<domain>/api/*`).
   - WAF managed rules enabled.
3. Tail logs for a few hours after announcing — `journalctl -u dumpling-wizard-api -f`.

That's the whole switch. The architecture doesn't change; only the Access policies are removed.

## Refreshing Cloudflare IP ranges

The `ufw` rules limit 80/443 to current CF IPs. These change rarely but do change. Run weekly via cron:

```sh
# /etc/cron.weekly/refresh-cf-ips
#!/bin/sh
/srv/dumpling-helpers/deploy/scripts/refresh-cf-ips.sh > /var/log/cf-ips.log 2>&1
```

## Common failures

- **502 from Caddy on dumpling** — the backend isn't running. Check `journalctl -u dumpling-wizard-api`.
- **Blank page** — `npm run build` produced no `dist/` for that app (look for build errors in `deploy.sh` output).
- **521 from Cloudflare** — Origin Cert mismatched or CF can't reach VPS. Check `ufw status` includes current CF ranges.
- **Apps load locally but external `curl` 521s** — SSL mode isn't "Full (strict)" or the origin cert doesn't cover the subdomain.
