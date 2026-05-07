/**
 * Pure parsing/analysis logic for `designed_variants.csv`.
 *
 * UI-free so it can be unit-tested independently of the React layer. Given the
 * raw CSV text, returns a structured summary suitable for the
 * `LibraryCompositionPage` panels: total counts, mutation-type breakdown,
 * per-position substitution coverage (flagging any position with fewer than 20
 * unique amino-acid substitutions), the list of missing AAs at flagged
 * positions, and a frameshift count for indels whose `length` is not a
 * multiple of 3.
 *
 * The column spec follows `docs/file-contracts.md` §4:
 *   count, pos, mutation_type, name, codon, mutation, length, hgvs
 *
 * The `mutation_type` field is read in the single-letter convention used by
 * the existing `frontend/src/lib/validateVariants.ts` (`M`/`S`/`D`/`I`/`X`),
 * but the file-contracts doc also documents `sub`/`del`/`ins`. Both are
 * accepted: long-form labels are folded into the single-letter buckets where
 * unambiguous, and any `sub` row is treated as missense (`M`) for the purposes
 * of the per-position coverage chart, since `designed_variants.csv` does not
 * carry a separate WT-vs-mutant flag.
 */
import Papa from 'papaparse'

// ─── Schema constants ───────────────────────────────────────────────────────

export const REQUIRED_COLUMNS = [
  'count',
  'pos',
  'mutation_type',
  'name',
  'codon',
  'mutation',
  'length',
  'hgvs',
] as const

/** All 20 standard amino acids (single-letter codes). */
export const STANDARD_AAS = [
  'A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I',
  'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V',
] as const

/** Threshold below which a position is flagged as under-covered. */
export const COVERAGE_THRESHOLD = 15

/** Display labels for the mutation-type bar chart. */
export const MUTATION_TYPE_LABELS: Record<string, string> = {
  M: 'Missense',
  S: 'Synonymous',
  D: 'Deletion',
  I: 'Insertion',
  X: 'Nonsense',
}

/** Order in which mutation types are rendered in the breakdown bar chart. */
export const MUTATION_TYPE_ORDER = ['M', 'S', 'D', 'I', 'X'] as const

// ─── Data types ─────────────────────────────────────────────────────────────

export interface VariantRow {
  count: string
  pos: string
  mutation_type: string
  name: string
  codon: string
  mutation: string
  length: string
  hgvs: string
  [key: string]: string
}

export interface PositionCoverage {
  pos: number
  /** Unique mutant amino acids encoded by substitutions at this position. */
  substitutions: Set<string>
  /** AAs that are absent from the standard 20 at this position. */
  missing: string[]
  flagged: boolean
}

export interface ParseSuccess {
  ok: true
  totalRows: number
  missingColumns: string[]
  /** Counts per mutation_type (single-letter bucket; unknown buckets fall under 'unknown'). */
  typeCounts: Record<string, number>
  /** Per-position coverage, sorted ascending by `pos`. */
  positions: PositionCoverage[]
  /** Subset of `positions` where `flagged === true`, retained for convenience. */
  flaggedPositions: PositionCoverage[]
  /** Number of indel rows where `length` is not a multiple of 3. */
  frameshiftCount: number
}

export interface ParseFailure {
  ok: false
  error: string
}

export type ParseResult = ParseSuccess | ParseFailure

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map `designed_variants.csv` mutation_type strings to single-letter buckets.
 *
 * Accepts both the single-letter convention (`M`/`S`/`D`/`I`/`X`) and the
 * long-form convention (`sub`/`del`/`ins`) documented in
 * `docs/file-contracts.md`. Returns `'unknown'` for anything else.
 */
export function normaliseMutationType(raw: string): string {
  const t = (raw ?? '').trim()
  if (t.length === 0) return 'unknown'
  if (t.length === 1) {
    const upper = t.toUpperCase()
    if (MUTATION_TYPE_LABELS[upper]) return upper
    return 'unknown'
  }
  switch (t.toLowerCase()) {
    case 'sub':
    case 'missense':
      return 'M'
    case 'syn':
    case 'synonymous':
      return 'S'
    case 'del':
    case 'deletion':
      return 'D'
    case 'ins':
    case 'insertion':
      return 'I'
    case 'non':
    case 'nonsense':
    case 'stop':
      return 'X'
    default:
      return 'unknown'
  }
}

/** Pick the mutant amino acid (single-letter) from a row.
 *
 * Tries `mutation` first (e.g. `S2C` → `C`), then `hgvs` (e.g. `p.Ser2Cys` →
 * `C`), then `name` (e.g. `Ser2Cys` → `C`). Returns the empty string if no
 * single-letter AA can be recovered.
 */
export function extractMutantAa(row: VariantRow): string {
  // 1. `mutation` like `S2C` → trailing single uppercase letter (or `*` for stop).
  const m1 = row.mutation?.match(/^[A-Z*]\d+([A-Z*])$/)
  if (m1) return m1[1]

  // 2. `hgvs` like `p.Ser2Cys` → trailing 3-letter AA → single letter.
  const m2 = row.hgvs?.match(/p\.[A-Za-z]{3}\d+([A-Za-z]{3}|\*|Ter)$/)
  if (m2) {
    const tail = m2[1]
    if (tail === '*' || tail.toLowerCase() === 'ter') return '*'
    const single = THREE_TO_ONE[tail.slice(0, 1).toUpperCase() + tail.slice(1).toLowerCase()]
    if (single) return single
  }

  // 3. `name` like `Ser2Cys` → trailing 3-letter AA.
  const m3 = row.name?.match(/^[A-Za-z]{3}\d+([A-Za-z]{3}|\*|Ter)$/)
  if (m3) {
    const tail = m3[1]
    if (tail === '*' || tail.toLowerCase() === 'ter') return '*'
    const single = THREE_TO_ONE[tail.slice(0, 1).toUpperCase() + tail.slice(1).toLowerCase()]
    if (single) return single
  }
  return ''
}

const THREE_TO_ONE: Record<string, string> = {
  Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C',
  Glu: 'E', Gln: 'Q', Gly: 'G', His: 'H', Ile: 'I',
  Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P',
  Ser: 'S', Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V',
}

// ─── Analysis ────────────────────────────────────────────────────────────────

function analyse(rows: VariantRow[], headers: string[]): ParseSuccess {
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c))

  const typeCounts: Record<string, number> = {}
  const posSubs = new Map<number, Set<string>>()
  let frameshiftCount = 0

  for (const row of rows) {
    const bucket = normaliseMutationType(row.mutation_type)
    typeCounts[bucket] = (typeCounts[bucket] ?? 0) + 1

    const pos = parseInt(row.pos, 10)
    if (!isNaN(pos) && (bucket === 'M' || bucket === 'S')) {
      // Only record substitutions for the per-position coverage chart.
      // Synonymous rows count as "the WT amino acid is represented" — but for
      // DMS coverage we care about *distinct mutant AAs* including the WT,
      // so we record whichever AA is encoded by this row.
      const aa = extractMutantAa(row)
      if (aa.length === 1 && /[A-Z]/.test(aa)) {
        if (!posSubs.has(pos)) posSubs.set(pos, new Set())
        posSubs.get(pos)!.add(aa)
      }
    }

    if (bucket === 'D' || bucket === 'I') {
      const len = parseInt(row.length, 10)
      if (!isNaN(len) && len % 3 !== 0) frameshiftCount++
    }
  }

  const positions: PositionCoverage[] = [...posSubs.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pos, subs]) => {
      const missing = STANDARD_AAS.filter((aa) => !subs.has(aa))
      return {
        pos,
        substitutions: subs,
        missing,
        flagged: subs.size < COVERAGE_THRESHOLD,
      }
    })

  const flaggedPositions = positions.filter((p) => p.flagged)

  return {
    ok: true,
    totalRows: rows.length,
    missingColumns,
    typeCounts,
    positions,
    flaggedPositions,
    frameshiftCount,
  }
}

/**
 * Parse + analyse a `designed_variants.csv` string.
 *
 * Returns `{ ok: true, … }` with the summary on success, or `{ ok: false,
 * error }` if the CSV is fundamentally unparseable. Schema issues (missing
 * required columns) surface non-fatally inside `missingColumns`.
 */
export function parseVariants(csvText: string): ParseResult {
  const parsed = Papa.parse<VariantRow>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { ok: false, error: `CSV parse error: ${parsed.errors[0]?.message}` }
  }
  const headers = parsed.meta.fields ?? []
  return analyse(parsed.data, headers)
}
