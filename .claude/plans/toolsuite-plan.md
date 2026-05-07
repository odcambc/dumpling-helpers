# DMS Toolsuite Architecture Plan

## Purpose

Rationalise and extend the DMS toolsuite (DIMPLE → dimple-qc-app → dumpling) with a
focus on clean API boundaries, a shared design language, and UI modularity. Work is
decomposed so an orchestrator can spawn independent subagents per task.

## Ecosystem map

```
DIMPLE (~/Projects/DIMPLE)
  CLI + tkinter GUI for library design.
  Outputs: oligo CSV, designed_variants.csv

      ↓  pre-synthesis QC

dumpling-helpers/library-qc/  ← monorepo subdirectory  [Phase 3]
  Web app: oligo validation, library composition view, sequencing planner.
  Served on :8001 (backend) / Vite next port (frontend) in dev.

      ↓  post-synthesis QC

dimple-qc-app (~/Projects/dimple-qc-app)
  Python Shiny app for Plasmidsaurus long-read sequencing QC.
  Stand-alone; leave as-is for now.

      ↓  experiment + analysis

dumpling (~/Projects/dumpling)
  Snakemake pipeline for DMS analysis.

dumpling-helpers (~/Projects/dumpling-helpers)  ← primary repo / monorepo root
  React/FastAPI config wizard for dumpling.
  Also hosts OligoValidator (/oligo-validator route).
  Served on :8000 (backend) / :5173 (frontend) in dev.
  library-qc/ lives here as a monorepo subdirectory (not a separate repo).
```

## Repository structure

```
dumpling-helpers/
  frontend/            — wizard React app (Vite, :5173)
  backend/             — wizard FastAPI app (uv, :8000)
  library-qc/
    frontend/          — library-qc React app (Vite, next port)
    backend/           — library-qc FastAPI app (uv, :8001)
  .devcontainer/       — single devcontainer covering both apps
  docs/
    file-contracts.md  — authoritative CSV/YAML format reference
  package.json         — root scripts: dev/check/lint/format for both apps
```

Root scripts:
- `npm run dev`          — all four processes (dh-api, dh-web, lq-api, lq-web)
- `npm run check`        — tsc + ruff across both apps
- `npm run install:all`  — npm + uv for both apps

## Shared file contracts

These CSV/YAML formats are the integration points between tools.
No tool imports another directly — integration is file-based.
Full spec: `docs/file-contracts.md`

| File | Producer | Consumers | Key columns |
|---|---|---|---|
| `designed_variants.csv` | DIMPLE | dumpling, library-qc | `name`, `pos`, `mutation_type`, `codon`, `mutation`, `hgvs` |
| `oligo CSV` | DIMPLE / manual | OligoValidator | `id,sequence` (no header) |
| `experiments.csv` | dumpling-helpers | dumpling | `sample`, `condition`, `replicate`, `time`/`bin`, `file` |
| `config.yaml` | dumpling-helpers | dumpling | per dumpling schema |

---

## Orchestration guide

An orchestrator agent should:
1. Read this file to understand the full plan.
2. Identify which tasks are ready (all dependencies marked `DONE`).
3. Spawn a subagent per ready task, passing it the **Subagent brief** section of
   that task exactly as written — it contains all context needed without the full plan.
4. Mark each task `DONE` in this file once the subagent reports completion.
5. Re-evaluate readiness and repeat.

Tasks within a phase that share no dependencies can run in parallel.

**Working directory for all tasks:** `/Users/bartleby/Projects/dumpling-helpers`
**library-qc lives at:** `library-qc/` inside the monorepo (not a separate repo).

### Status values
- `TODO` — not started
- `IN_PROGRESS` — subagent running
- `DONE` — complete and verified
- `BLOCKED` — waiting on dependency

---

## Pending

### Merge integration branch → main

`integration/phase-1-2` is complete and passes `npm run check`. Merge to `main`
when ready. All Phase 1 and Phase 2 work lives on this branch.

---

## Phase 1 — Rationalise dumpling-helpers  `DONE`

All merged into `integration/phase-1-2`. Passes `npm run check` clean.

### P1.1 — VariantsChecker inline in Step 3  `DONE`

VariantsChecker moved inline into Step 3. Drawer and sidebar button removed.
Split into `lib/validateVariants.ts` (pure logic) +
`components/VariantsChecker/InlineVariantsSummary.tsx` (panel UI).

### P1.2 — OligoValidator as a dedicated route  `DONE`

React Router added. `/oligo-validator` is a full page (`pages/OligoValidatorPage.tsx`)
with a back link to `/`. Drawer chrome removed from `OligoValidator.tsx`.

### P1.3 — Design token extraction  `DONE`

`frontend/src/lib/tokens.ts` exports `colors` (OKLCH brand palette) and `typography`
stacks, mirroring the Tailwind v4 `@theme` block in `index.css`.

### P1.4 — Sequencing coverage estimator  `DONE`

`frontend/src/lib/coverageEstimate.ts` + collapsible panel in Step 4 (Sample table).
Derives conditions/replicates/timepoints from live row data; warns above 50 Gbp.

---

## Phase 2 — Suite foundation  `DONE`

All merged into `integration/phase-1-2`.

### P2.1 — Document shared file contracts  `DONE`

`docs/file-contracts.md` — full spec for config.yaml, experiments.csv, oligo CSV,
designed_variants.csv. Includes required/optional columns and 3-row examples.

### P2.2 — Backend router modularisation  `DONE`

`backend/app/main.py` is now wiring-only. All routes in `routes/` files with
per-domain APIRouter prefixes. `GET /api/health` added (`routes/health.py`).

---

## Phase 3 — Library QC tool

All work in `library-qc/` inside the monorepo.
P3.1 is done (scaffold). P3.2 and P3.3 can run in parallel.

### P3.1 — Scaffold Library QC app  `DONE`

`library-qc/` exists in the monorepo with Vite + React + TS frontend,
FastAPI + uv backend, placeholder home page, and `GET /api/health`.
Standalone `.devcontainer` removed — monorepo `.devcontainer` covers both apps.

---

### P3.2 — Transplant OligoValidator  `TODO`

**Depends on:** P3.1 `DONE`, P1.2 `DONE`

**Subagent brief:**

Working repo: `/Users/bartleby/Projects/dumpling-helpers`
Working dir for library-qc: `library-qc/` (monorepo subdirectory, NOT a separate repo)

The OligoValidator is a full-page component in the wizard app at
`frontend/src/components/OligoValidator/OligoValidator.tsx`. It is already
rendered as a standalone page at `/oligo-validator` in the wizard
(`frontend/src/pages/OligoValidatorPage.tsx` — read this for the page wrapper pattern).

Task: wire the same component into the library-qc app so it is the primary
tool at its `/oligo-validator` route.

Files to read first:
- `frontend/src/components/OligoValidator/OligoValidator.tsx`
- `frontend/src/pages/OligoValidatorPage.tsx`
- `frontend/src/lib/tokens.ts`
- `frontend/src/lib/utils.ts`
- `library-qc/frontend/src/App.tsx`
- `library-qc/frontend/src/main.tsx`
- `library-qc/frontend/package.json`

Changes required:
1. Copy `frontend/src/components/OligoValidator/OligoValidator.tsx` →
   `library-qc/frontend/src/components/OligoValidator/OligoValidator.tsx`.
2. Copy `frontend/src/lib/tokens.ts` and `frontend/src/lib/utils.ts` →
   `library-qc/frontend/src/lib/` (same filenames). These are the only
   dependencies OligoValidator has outside its own file.
3. Add React Router to `library-qc/frontend/package.json` if not already present
   (check first — it may already be installed).
4. Create `library-qc/frontend/src/pages/OligoValidatorPage.tsx` mirroring the
   pattern in `frontend/src/pages/OligoValidatorPage.tsx` but with the back link
   pointing to `/` in library-qc.
5. Wire routes in `library-qc/frontend/src/main.tsx`:
   - `/` → existing App (placeholder home)
   - `/oligo-validator` → OligoValidatorPage
6. Update the placeholder home page in `library-qc/frontend/src/App.tsx` to
   include a link/card to `/oligo-validator` (replace the "coming soon" state
   with an active link).
7. Check that `library-qc/frontend` has the same Tailwind / CSS setup as
   `frontend/` — OligoValidator uses brand colour classes. Copy/adapt
   `frontend/src/index.css` if needed.

Acceptance criteria:
- `cd /Users/bartleby/Projects/dumpling-helpers && npm run dev:lib-web` starts Vite.
- Navigating to `/oligo-validator` renders the full validator UI.
- `npm run check:lib-web` (tsc --noEmit) passes.
- The original in `frontend/` is unchanged.

---

### P3.3 — Library composition panel  `TODO`

**Depends on:** P3.1 `DONE`

**Subagent brief:**

Working repo: `/Users/bartleby/Projects/dumpling-helpers`
Working dir for library-qc: `library-qc/` (monorepo subdirectory)

Add a `/library-composition` page to the library-qc app. Input: drag-and-drop
or file-picker for `designed_variants.csv`. Parse with PapaParse (add to
`library-qc/frontend/package.json` if absent).

Read the column spec from `docs/file-contracts.md` in the repo root before
implementing — it documents required/optional columns for designed_variants.csv.

Display (all CSS-only, no charting library):
- Total variant count
- Breakdown by `mutation_type` (M/S/D/I/X) as a horizontal bar chart
  (CSS `width` percentages)
- Per-position coverage: count of unique amino acid substitutions per position
  (flag positions with fewer than 15 — a complete DMS library has ~20)
- Missing substitutions: list which amino acids are absent at flagged positions
- Frameshift count: indels where `length` is not a multiple of 3

Files to read first:
- `docs/file-contracts.md` (designed_variants.csv spec)
- `library-qc/frontend/src/App.tsx` (existing home page to add nav link)
- `library-qc/frontend/src/main.tsx` (routes)
- `library-qc/frontend/package.json`

New files:
- `library-qc/frontend/src/pages/LibraryCompositionPage.tsx`
- `library-qc/frontend/src/lib/parseVariants.ts` — pure parsing/analysis logic,
  no React, fully testable

Add `/library-composition` to the router in `main.tsx` and a nav link on the
home page.

Acceptance criteria:
- Page renders with file input.
- Uploading a valid designed_variants.csv shows correct counts (verify manually
  against a known file).
- Positions with < 15 substitutions are highlighted.
- `npm run check:lib-web` passes.

---

## Phase 4 — Sequencing planning

### P4.1 — Sequencing planner in library-qc  `TODO`

**Depends on:** P3.3 `TODO`, P1.4 `DONE`

**Subagent brief:**

Working repo: `/Users/bartleby/Projects/dumpling-helpers`
Working dir for library-qc: `library-qc/` (monorepo subdirectory)

The coverage estimator logic already exists at
`frontend/src/lib/coverageEstimate.ts`. Copy it to
`library-qc/frontend/src/lib/coverageEstimate.ts` and build a `/sequencing-plan`
page on top of it.

Extend the estimator with multiplexing inputs:
- Number of samples (manually entered for now)
- Reads per flow cell: user selects from preset list
  (MiSeq 25M, NextSeq 400M, NovaSeq 6000 1.6B, custom)
- Cost per flow cell (optional — enables budget estimate output)

Additional outputs beyond the base estimator:
- Flow cells needed (ceil of totalReads / readsPerFlowCell)
- Samples per flow cell (floor of readsPerFlowCell / readsPerSample)
- Estimated cost (if cost entered)
- Warning if reads-per-sample drops below 200× target coverage when multiplexed

Files to read first:
- `frontend/src/lib/coverageEstimate.ts` (copy this to library-qc)
- `library-qc/frontend/src/main.tsx` (routes)
- `library-qc/frontend/src/App.tsx` (home page nav)

New files:
- `library-qc/frontend/src/lib/coverageEstimate.ts` (copy from wizard app)
- `library-qc/frontend/src/lib/sequencingPlan.ts` — multiplexing extension
- `library-qc/frontend/src/pages/SequencingPlanPage.tsx`

Add `/sequencing-plan` to the router and a nav link on the home page.

Acceptance criteria:
- Page renders with all inputs and derived outputs.
- Numbers match manual calculation: 500 variants × 500× coverage × 10 samples
  = 2.5 B reads total; on NextSeq 400M = 7 flow cells.
- `npm run check:lib-web` passes.

---

## Notes for orchestrator

- Each task's **Subagent brief** is self-contained — pass it verbatim.
- `library-qc/` is a subdirectory of the dumpling-helpers monorepo, not a
  separate git repo. All subagents work in `/Users/bartleby/Projects/dumpling-helpers`.
- Run `npm run check` from the repo root to validate all four codebases at once.
- P3.2 and P3.3 can run in parallel (both depend only on P3.1, which is done).
- P4.1 waits on P3.3 (needs the library composition page for nav coherence).
- Merge `integration/phase-1-2` → `main` before starting Phase 3 work.
