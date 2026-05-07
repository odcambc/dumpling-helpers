# library-qc devcontainer

Isolated dev environment for the library-qc tool suite. The container ships
Node.js 22, Python 3.13, and `uv`, and applies an egress-allowlist firewall at
start time so an agent running inside it can't pull from arbitrary domains.

## Files

- `Dockerfile` — base image + Node + Python 3.13 + uv.
- `devcontainer.json` — VS Code / Codespaces config (workspace folder, ports,
  post-create install, post-start firewall, recommended extensions).
- `init-firewall.sh` — egress allowlist applied at container start. Edit the
  TODO block in this script to add the domains the project legitimately needs.

## Ports

- `8770` — FastAPI backend (`uv run uvicorn app.main:app --port 8770`).
- `5273` — Vite dev server (configure via `vite --port 5273` if you want it
  to match the forwarded port; the default 5173 also works since dumpling-
  helpers' devcontainer uses 5173 + 8000).

## Disabling the firewall

Comment out the `postStartCommand` line in `devcontainer.json` and rebuild.
