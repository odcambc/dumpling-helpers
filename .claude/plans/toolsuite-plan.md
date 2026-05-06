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

Library Design QC tool  [NEW — Phase 3]
  Web app: oligo validation, library composition view, long-read QC (future).
  Absorbs OligoValidator from dumpling-helpers.

      ↓  post-synthesis QC

dimple-qc-app (~/Projects/dimple-qc-app)
  Python Shiny app for Plasmidsaurus long-read sequencing QC.
  Stand-alone; leave as-is for now.

      ↓  experiment + analysis

dumpling (~/Projects/dumpling)
  Snakemake pipeline for DMS analysis.

dumpling-helpers (~/Projects/dumpling-helpers)  ← primary repo
  React/FastAPI config wizard for dumpling.
  Currently also hosts OligoValidator + VariantsChecker (to be rationalised).
```

## Shared file contracts

These CSV/YAML formats are the integration points between tools.
No tool imports another directly — integration is file-based.

| File | Producer | Consumers | Key columns |
|---|---|---|---|
| `designed_variants.csv` | DIMPLE | dumpling, Lib-QC tool | `name`, `pos`, `mutation_type`, `codon`, `mutation`, `hgvs` |
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

### Status values
- `TODO` — not started
- `IN_PROGRESS` — subagent running
- `DONE` — complete and verified
- `BLOCKED` — waiting on dependency

---

## Phase 1 — Rationalise dumpling-helpers

All work in `~/Projects/dumpling-helpers`. No new repos. Tasks P1.1 and P1.2
are independent and can run in parallel. P1.3 and P1.4 can also run in parallel.
P1.4 depends on no other task but reads the variants schema from P1.2 context.

### P1.1 — VariantsChecker inline in Step 3  `TODO`

**Depends on:** nothing

**Subagent brief:**

Working repo: `/Users/bartleby/Projects/dumpling-helpers`
Branch: `feat/variants-inline` (create from main)

The VariantsChecker is currently a slide-over drawer triggered by a sidebar button
in `frontend/src/App.tsx`. Move it inline into Step 3 (Pipeline options) so it
activates automatically when `regenerate_variants` is on and `oligo_file` is
non-empty. Remove the sidebar button and the drawer.

Files to read first:
- `frontend/src/App.tsx`
- `frontend/src/components/wizard/StepPipeline.tsx`
- `frontend/src/components/VariantsChecker/VariantsChecker.tsx`

Changes required:
1. In `StepPipeline.tsx`: import the validation logic (not the drawer component)
   from `VariantsChecker`. When `form.watch('regenerate_variants')` is true and
   `form.watch('oligo_file')` is non-empty, render a compact inline summary:
   total variants, mutation_type breakdown, any flagged rows. Use the existing
   parse + check logic; just change the presentation from drawer to inline panel.
2. In `App.tsx`: remove `variantsOpen` state, the sidebar "Validate variants file"
   button, and the `<VariantsChecker>` render at the bottom.
3. The `VariantsChecker.tsx` component can be split: keep the pure validation logic
   as `validateVariants(csvText)` exported from a new `lib/validateVariants.ts`,
   and delete the drawer UI or repurpose it as a simple panel component.

Acceptance criteria:
- No sidebar "Validate variants" button visible.
- On Step 3, when `regenerate_variants` is checked and `oligo_file` has a value,
  a validation summary appears (even if the file can't be read — show a prompt to
  upload the file client-side for validation).
- `npx tsc --noEmit` passes.
- Existing behaviour for steps 1, 2, 4, 5 is unchanged.

---

### P1.2 — OligoValidator as a dedicated route  `TODO`

**Depends on:** nothing

**Subagent brief:**

Working repo: `/Users/bartleby/Projects/dumpling-helpers`
Branch: `feat/oligo-validator-page` (create from `feat/oligo-validator`)

The OligoValidator is currently a slide-over drawer (`open/onClose` props) launched
from a sidebar button in `App.tsx`. Convert it to a standalone page at `/oligo-validator`
using React Router (already installed — check `package.json`; add it if absent).

Files to read first:
- `frontend/src/App.tsx`
- `frontend/src/components/OligoValidator/OligoValidator.tsx`
- `frontend/src/main.tsx` (or wherever the React root is mounted)
- `frontend/package.json`

Changes required:
1. Add React Router. Wrap the app in `<BrowserRouter>`. Define two routes:
   - `/` → existing wizard layout (current `App` content)
   - `/oligo-validator` → `<OligoValidatorPage />`
2. Create `frontend/src/pages/OligoValidatorPage.tsx` — a full-page layout that
   renders the OligoValidator content directly (no drawer, no overlay). Give it
   a back link to `/`.
3. Strip the `open`/`onClose` props from `OligoValidator.tsx`; it should render
   its content unconditionally. The drawer chrome (fixed positioning, translate-x
   animation, backdrop) should be removed.
4. In `App.tsx`: replace the sidebar "Validate oligos" button with a `<Link>`
   to `/oligo-validator` that opens in the same tab.
5. Update the FastAPI backend's static file serving if needed so the `/oligo-validator`
   route falls back to `index.html` (standard SPA catch-all).

Acceptance criteria:
- Navigating to `/oligo-validator` renders the full validator UI, not a drawer.
- The main wizard at `/` still works completely.
- `npx tsc --noEmit` passes.
- The back-navigation link returns to `/`.

---

### P1.3 — Design token extraction  `TODO`

**Depends on:** nothing (can run parallel to P1.1 and P1.2)

**Subagent brief:**

Working repo: `/Users/bartleby/Projects/dumpling-helpers`
Branch: `feat/design-tokens` (create from main)

Extract the visual design constants into a single authoritative source so a future
second app can import or copy them as a starting point.

Files to read first:
- `frontend/tailwind.config.js` (or `.ts`)
- `frontend/src/index.css` (or global styles)
- Any file that defines `brand`, `brand-light`, `brand-dark` colours

Changes required:
1. Create `frontend/src/lib/tokens.ts` that exports:
   ```ts
   export const colors = {
     brand:      '#...',   // pull from tailwind config
     brandLight: '#...',
     brandDark:  '#...',
   } as const

   export const typography = {
     fontMono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
     fontSans: 'Inter, system-ui, sans-serif',
   } as const
   ```
2. The Tailwind config should continue to work as-is (no change to class names).
   `tokens.ts` is purely a reference export for code that needs the raw values
   (e.g. inline styles in the OligoValidator grid, chart colours in future tools).
3. Update the OligoValidator's hardcoded hex colours (STATUS_BG, STATUS_BORDER,
   AA_COLOR, AA_BG) to import brand colours from `tokens.ts` where they overlap.

Acceptance criteria:
- `tokens.ts` exists and exports `colors` and `typography`.
- `npx tsc --noEmit` passes.
- Visual appearance is unchanged.

---

### P1.4 — Sequencing coverage estimator  `TODO`

**Depends on:** nothing (can run parallel to P1.1–P1.3)

**Subagent brief:**

Working repo: `/Users/bartleby/Projects/dumpling-helpers`
Branch: `feat/coverage-estimator` (create from main)

Add a sequencing coverage estimator panel to Step 4 (Sample table). Given the
library size and experiment structure, estimate minimum reads per sample needed to
achieve a target per-variant coverage depth.

Files to read first:
- `frontend/src/components/SampleTable/SampleTable.tsx`
- `frontend/src/App.tsx` (how `rows`, `mode`, `includeTile` are passed)
- `frontend/src/schemas/experiments.ts`

The estimator logic (implement in `frontend/src/lib/coverageEstimate.ts`):

```
Inputs:
  variantCount    number   total variants in library (user-entered or read from file)
  conditions      number   unique conditions in sample table
  replicates      number   unique replicates per condition
  timepoints      number   unique timepoints (timecourse) or bins (sort)
  targetCoverage  number   desired reads per variant per sample (default: 500)

Output:
  readsPerSample  number   = variantCount × targetCoverage
  totalReads      number   = readsPerSample × (conditions × replicates × timepoints)
  gigabases       number   = totalReads × readLength / 1e9  (assume readLength=150)
```

UI changes to `SampleTable.tsx`:
1. Add a small collapsible "Coverage estimate" section below the sample table.
2. Inputs: variant count (number field, manual entry; note: will auto-populate
   from designed_variants.csv in a future task), target coverage depth (default 500),
   read length (default 150 bp).
3. Derive conditions/replicates/timepoints from the existing `rows` prop.
4. Display: reads/sample, total reads, and Gbp as `SummaryStat`-style cards.
5. Add a warning if total reads > 50 Gbp (likely needs multiple lanes).

Acceptance criteria:
- Panel appears in Step 4 below the sample table.
- Numbers update live as the sample table rows change.
- `npx tsc --noEmit` passes.

---

## Phase 2 — Suite foundation

Primarily documentation and backend modularisation. No new repos.
Can begin once Phase 1 tasks are merged.

### P2.1 — Document shared file contracts  `TODO`

**Depends on:** P1.1 (VariantsChecker inline gives us a clean spec for designed_variants.csv)

**Subagent brief:**

Working repo: `/Users/bartleby/Projects/dumpling-helpers`
Branch: `docs/file-contracts`

Create `docs/file-contracts.md` documenting the CSV/YAML formats that connect the
toolsuite. Read the following files to derive the specs:
- `frontend/src/schemas/config.ts` — config.yaml schema
- `frontend/src/schemas/experiments.ts` — experiments.csv schema
- `frontend/src/components/OligoValidator/OligoValidator.tsx` — oligo CSV + designed_variants.csv columns validated

Document each format with: purpose, producer, consumers, required columns with types,
optional columns, and a 3-row example. This file becomes the reference for anyone
building a new tool that reads or writes these formats.

---

### P2.2 — Backend router modularisation  `TODO`

**Depends on:** nothing in Phase 2

**Subagent brief:**

Working repo: `/Users/bartleby/Projects/dumpling-helpers`
Branch: `refactor/backend-routers`

Read `backend/app/main.py` and all files in `backend/app/routes/`. The goal is to
ensure each logical domain has its own APIRouter with a clear prefix, so that a
future second FastAPI app can import individual routers rather than the whole app.

Specifically:
1. Confirm each route file uses `router = APIRouter(prefix="...", tags=["..."])`.
2. `main.py` should do nothing but create the FastAPI app, register routers, and
   mount static files. No route handlers inline.
3. If any route logic lives directly in `main.py`, extract it.
4. Add a `GET /api/health` route that returns `{"status": "ok", "version": "..."}`.
   Read the version from `pyproject.toml`.

Acceptance criteria:
- All routes are in `routes/` files, none inline in `main.py`.
- The app starts and all existing routes respond correctly.
- `GET /api/health` returns 200 with `{"status": "ok"}`.

---

## Phase 3 — Library Design QC tool  (new standalone app)

New repo or monorepo package. Scaffold once Phase 2 is complete.
The OligoValidator logic transplanted from dumpling-helpers is the seed.

### P3.1 — Scaffold Library QC app  `TODO`

**Depends on:** P1.2 (OligoValidator page — proves the component works standalone), P2.2

**Subagent brief:**

Create a new Vite + React + TypeScript app at `~/Projects/library-qc` using the same
stack as dumpling-helpers. Copy the tooling config (Tailwind, path aliases, ESLint,
`tsconfig.json`) from `~/Projects/dumpling-helpers/frontend` as a starting point.

Structure:
```
library-qc/
  frontend/   — React app (Vite)
  backend/    — FastAPI app (uv, Python 3.13)
  .devcontainer/  — copy + adapt from dumpling-helpers
  pyproject.toml
  package.json (root, for scripts)
```

The backend should have the same health endpoint structure as dumpling-helpers after P2.2.
The frontend should have a placeholder home page that lists the planned tools
(Oligo Validator, Library Composition, Long-read QC) with "coming soon" states.
No actual tool logic yet — this task is scaffolding only.

Acceptance criteria:
- `cd library-qc && npm run dev` starts the Vite dev server.
- `cd library-qc/backend && uv run uvicorn app.main:app` starts the API.
- `GET /api/health` returns 200.
- `npx tsc --noEmit` passes.

---

### P3.2 — Transplant OligoValidator  `TODO`

**Depends on:** P3.1, P1.2

**Subagent brief:**

Working repo: `~/Projects/library-qc`

Copy `OligoValidator.tsx` from `~/Projects/dumpling-helpers/frontend/src/components/OligoValidator/`
into `~/Projects/library-qc/frontend/src/pages/OligoValidatorPage.tsx`.
Adapt it to render as a full page (the page variant created in P1.2 is the model).
Copy any shared utilities it depends on (`lib/utils.ts`, `lib/tokens.ts` from P1.3).

Acceptance criteria:
- `/oligo-validator` in library-qc renders the full validator UI.
- `npx tsc --noEmit` passes in library-qc.
- The original in dumpling-helpers is unchanged.

---

### P3.3 — Library composition panel  `TODO`

**Depends on:** P3.1

**Subagent brief:**

Working repo: `~/Projects/library-qc`

Add a `/library-composition` page. Input: drag-and-drop `designed_variants.csv`.
Display:
- Total variant count
- Breakdown by `mutation_type` (M/S/D/I/X) as a horizontal bar chart (CSS widths, no charting library)
- Per-position coverage: how many amino acid substitutions are designed at each position
  (should be ~20 for a complete DMS library; flag positions with fewer than 15)
- Missing substitutions: which amino acids are absent at which positions
- Frameshift flag: count of indels that are not multiples of 3

Read the column spec from `~/Projects/dumpling-helpers/docs/file-contracts.md` (created in P2.1).

Acceptance criteria:
- Uploading the example variants file from `~/Projects/dumpling-helpers/examples/`
  shows a correct breakdown.
- Positions with < 15 substitutions are highlighted.
- `npx tsc --noEmit` passes.

---

## Phase 4 — Sequencing planning (cross-tool bridge)

### P4.1 — Sequencing planner in library-qc  `TODO`

**Depends on:** P3.3 (library composition panel gives us variant count), P1.4 (estimator logic already written)

**Subagent brief:**

Working repo: `~/Projects/library-qc`

Add a `/sequencing-plan` page. It should import and reuse the `coverageEstimate`
function from the dumpling-helpers implementation (copy `lib/coverageEstimate.ts`
from `~/Projects/dumpling-helpers/frontend/src/lib/`).

Extend the estimator with multiplexing:
- Input: number of samples (from experiment design, manually entered for now),
  reads per flow cell (user selects: MiSeq 25M, NextSeq 400M, NovaSeq 6000 1.6B,
  custom), cost per flow cell (optional, for budget estimate).
- Output: flow cells needed, samples per flow cell, cost estimate if price entered.
- Warn if reads-per-sample drops below 200× target coverage when multiplexed.

Acceptance criteria:
- Page renders with all inputs and outputs.
- Numbers match manual calculation for a known test case.
- `npx tsc --noEmit` passes.

---

## Notes for orchestrator

- Each task's **Subagent brief** is designed to be passed verbatim to a subagent.
  The subagent should not need to read this full file.
- Update task status in-place as work proceeds.
- After each Phase 1 task completes, open a PR against `main` in dumpling-helpers.
- Phase 3 tasks create a new repo — the orchestrator should initialise git there.
- Parallelism available: P1.1 + P1.2 + P1.3 + P1.4 can all run simultaneously.
  P3.2 + P3.3 can run in parallel once P3.1 is done.
