// Single source of truth for the SOUS-CHEF suite: what tools exist, where they
// live, and the help/info links. Shared by SuiteBrand / SuiteSwitcher / HelpMenu
// so the tool list can't drift across the three apps.

export const SUITE_NAME = 'SOUS-CHEF'
export const SUITE_TAGLINE =
  'Sequence Oriented Unified Scoring Configuration Helper and Extra Functions'

// Each app is served from its own origin (separate subdomains in production), so
// cross-tool links must be absolute. URLs come from build-time env vars, falling
// back to the local dev ports (see vite.config.ts in each app).
//
// import.meta.env is cast loosely because these VITE_* keys aren't in vite's
// default ImportMetaEnv typing.
const env = import.meta.env as unknown as Record<string, string | undefined>
const DUMPLING_URL = env.VITE_DUMPLING_URL ?? 'http://localhost:5173'
const STROMBOLI_URL = env.VITE_STROMBOLI_URL ?? 'http://localhost:5174'
const FUSILLI_URL = env.VITE_FUSILLI_URL ?? 'http://localhost:5175'

export interface SuiteTool {
  /** Stable id; also the value passed as `current` to the switcher. */
  id: string
  label: string
  /** Monogram shown in the dropdown row. */
  letter: string
  /** Group heading in the dropdown. */
  group: string
  /** Absolute URL — used for cross-app navigation (full page load). */
  href: string
  /** In-app route — used with the switcher's renderLink for same-app SPA nav. */
  path: string
  /** Which app serves this tool (drives same-app router-link optimization). */
  app: 'dumpling' | 'fusilli' | 'stromboli'
  blurb?: string
}

export const SUITE_TOOLS: SuiteTool[] = [
  // ── Config wizards (one per app) ───────────────────────────────────────
  { id: 'dumpling', label: 'Dumpling', letter: 'D', group: 'Config wizards', href: DUMPLING_URL, path: '/', app: 'dumpling', blurb: 'DMS pipeline config' },
  { id: 'fusilli', label: 'Fusilli', letter: 'F', group: 'Config wizards', href: FUSILLI_URL, path: '/', app: 'fusilli', blurb: 'Fusion pipeline config' },
  { id: 'stromboli', label: 'Stromboli', letter: 'S', group: 'Config wizards', href: STROMBOLI_URL, path: '/', app: 'stromboli', blurb: 'Barcode-mapping config' },

  // ── Dumpling tools (sibling routes within the dumpling app) ────────────
  { id: 'oligo-validator', label: 'Oligo validator', letter: 'D', group: 'Dumpling tools', href: `${DUMPLING_URL}/oligo-validator`, path: '/oligo-validator', app: 'dumpling' },
  { id: 'library-composition', label: 'Library composition', letter: 'D', group: 'Dumpling tools', href: `${DUMPLING_URL}/library-composition`, path: '/library-composition', app: 'dumpling' },
  { id: 'sequencing-plan', label: 'Sequencing planner', letter: 'D', group: 'Dumpling tools', href: `${DUMPLING_URL}/sequencing-plan`, path: '/sequencing-plan', app: 'dumpling' },
]

/** Ordered group headings, derived from SUITE_TOOLS (dedup, insertion order). */
export const SUITE_GROUPS: string[] = [...new Set(SUITE_TOOLS.map((t) => t.group))]

export interface HelpLink {
  label: string
  href: string
}

export const HELP_LINKS: {
  repos: HelpLink[]
  docs: HelpLink[]
  citation: string
} = {
  repos: [
    { label: 'SOUS-CHEF (this suite)', href: 'https://github.com/odcambc/dumpling-helpers' },
    { label: 'dumpling pipeline', href: 'https://github.com/odcambc/dumpling' },
    { label: 'fusilli pipeline', href: 'https://github.com/odcambc/fusilli' },
    { label: 'stromboli pipeline', href: 'https://github.com/odcambc/stromboli' },
  ],
  docs: [
    { label: 'SOUS-CHEF (this suite)', href: 'https://github.com/odcambc/dumpling-helpers' },
    { label: 'dumpling pipeline', href: 'https://github.com/odcambc/dumpling' },
    { label: 'fusilli pipeline', href: 'https://github.com/odcambc/fusilli' },
    { label: 'stromboli pipeline', href: 'https://github.com/odcambc/stromboli' },
  ],
  citation: 'https://doi.org/10.1186/s13059-024-03279-7',
}
