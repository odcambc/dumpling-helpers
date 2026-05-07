#!/usr/bin/env bash
#
# Egress allowlist for the dev container.
#
# Why this exists:
#   The container already isolates Claude from your host filesystem. This
#   script adds a *network* boundary: by default, the agent can ONLY reach
#   domains you've approved here. That means an `npm install` of a typo-
#   squatted package or a curl|sh from a hijacked domain has nowhere to go.
#
# How it works:
#   1. Resolve each allowlisted domain to its current IPs.
#   2. Stuff those IPs into an ipset.
#   3. Drop all OUTPUT traffic except: loopback, established connections,
#      DNS (so resolvers keep working), and packets to the ipset.
#
# To disable: comment out the `postStartCommand` in devcontainer.json.

set -euo pipefail

# Reset prior rules so the script is idempotent across container restarts.
iptables -F OUTPUT 2>/dev/null || true
ipset destroy allowed-egress 2>/dev/null || true
ipset create allowed-egress hash:ip family inet hashsize 1024 maxelem 65536

# ─── TODO: define the allowlist ────────────────────────────────────────────
# Add the domains this project legitimately needs to reach. Think about:
#
#   * Package registries:  registry.npmjs.org, pypi.org, files.pythonhosted.org
#   * Source control:      github.com, codeload.github.com, objects.githubusercontent.com
#   * Anthropic API:       api.anthropic.com   (required if Claude Code is to work!)
#   * Anything else this project pulls at install/runtime
#
# Trade-offs to weigh:
#   - Tighter list = stronger sandbox, but `npm install <new dep>` may fail
#     until you add the registry's CDN host.
#   - GitHub in particular fans out to many CDN hostnames; you may need to
#     add codeload.github.com + *.githubusercontent.com to actually clone repos.
#   - DNS itself is allowed below (UDP/53), so name resolution always works.
#
# Format: one domain per line in the array. The loop below handles the rest.

ALLOWED_DOMAINS=(
  # Anthropic — required for Claude Code to function
  "api.anthropic.com"
  "statsig.anthropic.com"
  "sentry.io"                        # Claude Code error reporting

  # npm — package installs and audits
  "registry.npmjs.org"
  "cdn.npmjs.org"

  # Python packaging (uv / pip)
  "pypi.org"
  "files.pythonhosted.org"

  # GitHub — git clone, gh CLI, raw content
  "github.com"
  "api.github.com"
  "codeload.github.com"
  "objects.githubusercontent.com"
  "raw.githubusercontent.com"

  # uv binary downloads (astral.sh CDN)
  "astral.sh"
  "github-releases.githubusercontent.com"
)
# ───────────────────────────────────────────────────────────────────────────

for domain in "${ALLOWED_DOMAINS[@]}"; do
  # `getent ahostsv4` returns one line per A record; dedupe and add to ipset.
  while read -r ip; do
    [[ -n "$ip" ]] && ipset add allowed-egress "$ip" 2>/dev/null || true
  done < <(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u)
done

# Baseline rules: keep loopback + already-open connections + DNS working.
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Allow traffic to anything in the resolved-IP set; drop the rest.
iptables -A OUTPUT -m set --match-set allowed-egress dst -j ACCEPT
iptables -P OUTPUT DROP

echo "[init-firewall] egress restricted to ${#ALLOWED_DOMAINS[@]} domain(s)."
