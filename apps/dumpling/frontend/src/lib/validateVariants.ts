/**
 * Pure validation logic for variants CSV files.
 *
 * Parses + analyses a variants CSV (the kind expected by the dumpling pipeline)
 * and returns schema/coverage statistics. UI-free so it can be reused by either
 * an inline panel in the wizard or a stand-alone drawer.
 */
import Papa from 'papaparse'

// ─── Schema constants ───────────────────────────────────────────────────────

export const REQUIRED_COLUMNS = [
  'count', 'pos', 'mutation_type', 'name', 'codon', 'mutation', 'length', 'hgvs',
] as const

export const VALID_MUTATION_TYPES = new Set(['S', 'M', 'D', 'I', 'X'])

export const MUTATION_TYPE_LABELS: Record<string, string> = {
  M: 'Missense',
  S: 'Synonymous',
  D: 'Deletion',
  I: 'Insertion',
  X: 'Nonsense',
}

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

export interface PositionData {
  wt: string
  missense: Set<string>
  synonymous: boolean
  nonsense: boolean
  deletions: number
  /** Positions covered by a multi-codon deletion that *started* at an earlier position */
  deletionSpan: number
  insertions: number
  totalVariants: number
}

export interface RowIssue {
  row: number
  name: string
  problems: string[]
}

export interface ValidationResult {
  totalRows: number
  missingColumns: string[]
  typeCounts: Record<string, number>
  posMin: number
  posMax: number
  emptyCells: Record<string, number>
  rowIssues: RowIssue[]
  positionMap: Map<number, PositionData>
  sortedPositions: number[]
}

export interface ValidationOutcome {
  ok: true
  result: ValidationResult
}

export interface ValidationFailure {
  ok: false
  error: string
}

// ─── Analysis ────────────────────────────────────────────────────────────────

function buildPositionMap(rows: VariantRow[]): Map<number, PositionData> {
  const map = new Map<number, PositionData>()

  function getOrCreate(pos: number): PositionData {
    if (!map.has(pos)) {
      map.set(pos, {
        wt: '?', missense: new Set(), synonymous: false, nonsense: false,
        deletions: 0, deletionSpan: 0, insertions: 0, totalVariants: 0,
      })
    }
    return map.get(pos)!
  }

  for (const row of rows) {
    const pos = parseInt(row.pos, 10)
    if (isNaN(pos)) continue
    const d = getOrCreate(pos)

    if (d.wt === '?') {
      const wt = row.name?.match(/^([A-Z]+)\d/)?.[1]?.[0]
      if (wt) d.wt = wt
    }

    d.totalVariants++
    if (row.mutation_type === 'M') d.missense.add(row.mutation)
    else if (row.mutation_type === 'S') d.synonymous = true
    else if (row.mutation_type === 'X') d.nonsense = true
    else if (row.mutation_type === 'D') {
      d.deletions++
      const len = parseInt(row.length, 10)
      if (!isNaN(len) && len > 1) {
        for (let i = 1; i < len; i++) {
          getOrCreate(pos + i).deletionSpan++
        }
      }
    } else if (row.mutation_type === 'I') {
      d.insertions++
    }
  }
  return map
}

function analyseVariants(rows: VariantRow[], headers: string[]): ValidationResult {
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c))
  const typeCounts: Record<string, number> = {}
  const emptyCells: Record<string, number> = {}
  const rowIssues: RowIssue[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const problems: string[] = []

    if (isNaN(parseInt(row.pos, 10))) problems.push(`pos "${row.pos}" is not a number`)
    if (isNaN(parseInt(row.count, 10))) problems.push(`count "${row.count}" is not a number`)
    if (row.mutation_type && !VALID_MUTATION_TYPES.has(row.mutation_type))
      problems.push(`unknown mutation_type "${row.mutation_type}"`)
    if (!row.name?.trim()) problems.push('name is empty')

    const mt = row.mutation_type ?? 'unknown'
    typeCounts[mt] = (typeCounts[mt] ?? 0) + 1
    for (const col of REQUIRED_COLUMNS) {
      if (col === 'codon') continue
      if (!row[col]?.trim()) emptyCells[col] = (emptyCells[col] ?? 0) + 1
    }
    if (problems.length > 0 && rowIssues.length < 10)
      rowIssues.push({ row: i + 2, name: row.name || `(row ${i + 2})`, problems })
  }

  const positionMap = buildPositionMap(rows)
  const sortedPositions = [...positionMap.keys()].sort((a, b) => a - b)
  const posMin = sortedPositions.length > 0 ? sortedPositions[0] : 0
  const posMax = sortedPositions.length > 0 ? sortedPositions[sortedPositions.length - 1] : 0

  return {
    totalRows: rows.length,
    missingColumns,
    typeCounts,
    posMin,
    posMax,
    emptyCells,
    rowIssues,
    positionMap,
    sortedPositions,
  }
}

/**
 * Parse + validate a variants CSV string.
 *
 * Returns `{ ok: true, result }` on success or `{ ok: false, error }` if the
 * CSV is fundamentally unparseable. Schema/row issues with otherwise valid CSV
 * surface inside `result.missingColumns` / `result.rowIssues`.
 */
export function validateVariants(csvText: string): ValidationOutcome | ValidationFailure {
  const parsed = Papa.parse<VariantRow>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { ok: false, error: `CSV parse error: ${parsed.errors[0]?.message}` }
  }
  const headers = parsed.meta.fields ?? []
  return { ok: true, result: analyseVariants(parsed.data, headers) }
}
