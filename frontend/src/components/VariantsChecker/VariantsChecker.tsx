import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { X, Upload, CheckCircle, AlertTriangle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Constants ─────────────────────────────────────────────────────────────

const REQUIRED_COLUMNS = ['count', 'pos', 'mutation_type', 'name', 'codon', 'mutation', 'length', 'hgvs']
const VALID_MUTATION_TYPES = new Set(['S', 'M', 'D', 'I', 'X'])
const MUTATION_TYPE_LABELS: Record<string, string> = {
  M: 'Missense', S: 'Synonymous', D: 'Deletion', I: 'Insertion', X: 'Nonsense',
}

// Standard DMS amino acid order: grouped by biochemical property
const AA_ORDER = ['F', 'W', 'Y', 'C', 'H', 'K', 'R', 'D', 'E', 'N', 'Q', 'S', 'T', 'G', 'A', 'V', 'I', 'L', 'M', 'P']

// Colors by biochemical property (used for both WT tiles and substitution cells)
const AA_COLOR: Record<string, string> = {
  // Aromatic
  F: '#B45309', W: '#92400E', Y: '#D97706',
  // Cysteine
  C: '#065F46',
  // Basic
  H: '#1D4ED8', K: '#2563EB', R: '#1E40AF',
  // Acidic
  D: '#B91C1C', E: '#DC2626',
  // Polar uncharged
  N: '#059669', Q: '#10B981', S: '#34D399', T: '#6EE7B7',
  // Aliphatic / hydrophobic
  G: '#6B7280', A: '#9CA3AF', V: '#B45309', I: '#92400E', L: '#78350F', M: '#A16207', P: '#D97706',
}

const AA_BG: Record<string, string> = {
  F: '#FEF3C7', W: '#FDE68A', Y: '#FEF9C3',
  C: '#D1FAE5',
  H: '#DBEAFE', K: '#BFDBFE', R: '#93C5FD',
  D: '#FEE2E2', E: '#FECACA',
  N: '#D1FAE5', Q: '#A7F3D0', S: '#ECFDF5', T: '#D1FAE5',
  G: '#F3F4F6', A: '#F9FAFB', V: '#FFFBEB', I: '#FEF3C7', L: '#FEF3C7', M: '#FEF9C3', P: '#FFFBEB',
}

const WINDOW_SIZE = 20

// ─── Data types ─────────────────────────────────────────────────────────────

interface VariantRow {
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

interface PositionData {
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

interface RowIssue {
  row: number
  name: string
  problems: string[]
}

interface CheckResult {
  filename: string
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

    // Update WT from variant name if not yet resolved
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
      // length is in codons — span subsequent positions for multi-codon deletions
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

function analyseVariants(rows: VariantRow[], headers: string[]): Omit<CheckResult, 'filename'> {
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
  // Derive range from the map so multi-codon deletion spans are included
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function AaTile({ aa, size = 'md', dim }: { aa: string; size?: 'sm' | 'md' | 'lg'; dim?: boolean }) {
  const bg = AA_BG[aa] ?? '#F3F4F6'
  const color = AA_COLOR[aa] ?? '#6B7280'
  const px = size === 'sm' ? 13 : size === 'lg' ? 20 : 16
  return (
    <span
      title={aa}
      style={{
        background: dim ? '#F3F4F6' : bg,
        color: dim ? '#D1D5DB' : color,
        width: px, height: px,
        fontSize: size === 'sm' ? 8 : size === 'lg' ? 11 : 9,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 3, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0,
        border: `1px solid ${dim ? '#E5E7EB' : bg}`,
      }}
    >
      {aa}
    </span>
  )
}

function CoverageRibbon({
  sortedPositions, posMin, posMax, positionMap, windowStart, onNavigate,
}: {
  sortedPositions: number[]
  posMin: number; posMax: number
  positionMap: Map<number, PositionData>
  windowStart: number
  onNavigate: (pos: number) => void
}) {
  const range = posMax - posMin + 1
  if (range <= 0) return null

  // Maximum missense variants per position for normalising colour
  const maxMissense = Math.max(...sortedPositions.map(p => positionMap.get(p)?.missense.size ?? 0), 1)

  function posColor(pos: number): string {
    const d = positionMap.get(pos)
    if (!d) return '#E5E7EB'  // missing — light gray
    const frac = d.missense.size / maxMissense
    if (frac >= 0.8) return '#34D399'  // well covered — green
    if (frac >= 0.4) return '#FCD34D'  // partial — amber
    return '#FCA5A5'                    // sparse — red
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    const pos = Math.round(posMin + frac * (range - 1))
    onNavigate(pos)
  }

  // Window indicator bounds
  const windowEnd = windowStart + WINDOW_SIZE - 1
  const indLeft = ((windowStart - posMin) / range) * 100
  const indWidth = (WINDOW_SIZE / range) * 100

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{posMin}</span>
        <span className="text-gray-500 font-medium">
          Missense coverage — click to navigate · {sortedPositions.length} of {range} positions covered
        </span>
        <span>{posMax}</span>
      </div>
      <div
        className="relative h-5 rounded overflow-hidden cursor-crosshair"
        style={{ background: '#E5E7EB' }}
        onClick={handleClick}
        title="Click to navigate"
      >
        {/* Position bars */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: range }, (_, i) => {
            const pos = posMin + i
            return (
              <div
                key={pos}
                style={{ flex: 1, background: posColor(pos) }}
                title={`pos ${pos}: ${positionMap.get(pos)?.missense.size ?? 0} missense`}
              />
            )
          })}
        </div>
        {/* Window indicator */}
        <div
          className="absolute top-0 bottom-0 border-2 border-gray-700 rounded-sm pointer-events-none"
          style={{ left: `${Math.max(0, indLeft)}%`, width: `${Math.min(indWidth, 100 - indLeft)}%` }}
        />
      </div>
      <div className="flex gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-300 inline-block" />≥80% covered</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-amber-300 inline-block" />partial</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-300 inline-block" />sparse</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-gray-200 inline-block" />absent</span>
      </div>
    </div>
  )
}

function SubstitutionGrid({
  positionMap, windowStart, allPositions, posMin, posMax,
}: {
  positionMap: Map<number, PositionData>
  windowStart: number
  allPositions: number[]
  posMin: number; posMax: number
}) {
  const windowPositions = Array.from(
    { length: WINDOW_SIZE },
    (_, i) => windowStart + i,
  ).filter((p) => p >= posMin && p <= posMax)

  const CELL = 16
  const LABEL_W = 22

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: LABEL_W + windowPositions.length * (CELL + 1) }}>
        {/* Position number header */}
        <div className="flex mb-1">
          <div style={{ width: LABEL_W }} />
          {windowPositions.map((pos) => (
            <div
              key={pos}
              style={{ width: CELL, marginRight: 1, fontSize: 8 }}
              className="text-center text-gray-400 font-mono"
            >
              {pos}
            </div>
          ))}
        </div>

        {/* WT row */}
        <div className="flex items-center mb-1">
          <div style={{ width: LABEL_W, fontSize: 8 }} className="text-gray-400 font-semibold text-right pr-1">WT</div>
          {windowPositions.map((pos) => {
            const d = positionMap.get(pos)
            return (
              <div key={pos} style={{ width: CELL, marginRight: 1 }} className="flex justify-center">
                {d ? <AaTile aa={d.wt} size="sm" /> : <span style={{ width: CELL, height: CELL, display: 'block' }} />}
              </div>
            )
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 mb-1" />

        {/* Amino acid substitution rows */}
        {AA_ORDER.map((aa) => (
          <div key={aa} className="flex items-center" style={{ marginBottom: 1 }}>
            <div
              style={{ width: LABEL_W, fontSize: 8, color: AA_COLOR[aa] ?? '#6B7280' }}
              className="font-mono font-bold text-right pr-1"
            >
              {aa}
            </div>
            {windowPositions.map((pos) => {
              const d = positionMap.get(pos)
              const present = d?.wt === aa
                ? undefined  // this is the WT — show special
                : d?.missense.has(aa) ?? false
              return (
                <div key={pos} style={{ width: CELL, height: CELL, marginRight: 1 }} className="flex justify-center items-center">
                  {d?.wt === aa ? (
                    // WT position — skip (already shown above)
                    <div style={{ width: CELL - 2, height: CELL - 2, borderRadius: 2, background: '#F3F4F6' }} />
                  ) : present ? (
                    <div
                      title={`${d?.wt}${pos}${aa}`}
                      style={{
                        width: CELL - 2, height: CELL - 2, borderRadius: 2,
                        background: AA_BG[aa] ?? '#F3F4F6',
                        border: `1px solid ${AA_COLOR[aa] ?? '#9CA3AF'}`,
                      }}
                    />
                  ) : (
                    <div style={{ width: CELL - 2, height: CELL - 2, borderRadius: 2, background: '#F9FAFB' }} />
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* Divider */}
        <div className="border-t border-gray-200 mt-1 mb-1" />

        {/* Special rows: synonymous, nonsense, deletion, insertion */}
        {[
          { key: 'syn', label: 'Syn', check: (d: PositionData) => d.synonymous, spanCheck: null, color: '#6B7280' },
          { key: 'stp', label: 'Stp', check: (d: PositionData) => d.nonsense, spanCheck: null, color: '#1F2937' },
          { key: 'del', label: 'Del', check: (d: PositionData) => d.deletions > 0, spanCheck: (d: PositionData) => d.deletionSpan > 0, color: '#7C3AED' },
          { key: 'ins', label: 'Ins', check: (d: PositionData) => d.insertions > 0, spanCheck: null, color: '#0891B2' },
        ].map(({ key, label, check, spanCheck, color }) => (
          <div key={key} className="flex items-center" style={{ marginBottom: 1 }}>
            <div style={{ width: LABEL_W, fontSize: 8, color }} className="font-mono font-bold text-right pr-1">
              {label}
            </div>
            {windowPositions.map((pos) => {
              const d = positionMap.get(pos)
              const present = d ? check(d) : false
              const spanned = !present && spanCheck && d ? spanCheck(d) : false
              return (
                <div key={pos} style={{ width: CELL, height: CELL, marginRight: 1 }} className="flex justify-center items-center">
                  <div
                    title={spanned ? `spanned by deletion from earlier position` : undefined}
                    style={{
                      width: CELL - 2, height: CELL - 2, borderRadius: 2,
                      background: present ? color : spanned ? color : '#F9FAFB',
                      opacity: present ? 0.7 : spanned ? 0.25 : 1,
                      // Dashed border helps distinguish "spanned through" from "starts here"
                      border: spanned ? `1px dashed ${color}` : 'none',
                    }}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* AA property legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {[
          { label: 'Aromatic', aas: ['F', 'W', 'Y'] },
          { label: 'Basic', aas: ['H', 'K', 'R'] },
          { label: 'Acidic', aas: ['D', 'E'] },
          { label: 'Polar', aas: ['N', 'Q', 'S', 'T', 'C'] },
          { label: 'Aliphatic', aas: ['G', 'A', 'V', 'I', 'L', 'M', 'P'] },
        ].map(({ label, aas }) => (
          <div key={label} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span>{label}:</span>
            {aas.map((aa) => <AaTile key={aa} aa={aa} size="sm" />)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

export function VariantsChecker({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [windowStart, setWindowStart] = useState(1)

  async function handleFile(file: File) {
    setLoading(true); setError(null); setResult(null)
    const text = await file.text()
    const parsed = Papa.parse<VariantRow>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() })
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      setError(`CSV parse error: ${parsed.errors[0]?.message}`)
      setLoading(false); return
    }
    const headers = parsed.meta.fields ?? []
    const stats = analyseVariants(parsed.data, headers)
    setResult({ filename: file.name, ...stats })
    setWindowStart(stats.posMin)
    setLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function navigate(delta: number) {
    if (!result) return
    setWindowStart((s) => Math.max(result.posMin, Math.min(result.posMax - WINDOW_SIZE + 1, s + delta)))
  }

  function navigateTo(pos: number) {
    if (!result) return
    const centered = pos - Math.floor(WINDOW_SIZE / 2)
    setWindowStart(Math.max(result.posMin, Math.min(result.posMax - WINDOW_SIZE + 1, centered)))
  }

  const hasIssues = result && (result.missingColumns.length > 0 || result.rowIssues.length > 0)
  const isClean = result && !hasIssues

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-[600px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Variants file checker</h2>
            <p className="text-xs text-gray-400 mt-0.5">Schema validation + sequence context visualisation</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer hover:border-brand hover:bg-brand-light transition-colors"
          >
            <Upload size={18} className="text-gray-400" />
            <p className="text-sm text-gray-500">{loading ? 'Parsing…' : 'Drop variants CSV here or click to browse'}</p>
            <input ref={inputRef} type="file" accept=".csv" className="sr-only" onChange={handleChange} />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-lg p-3 text-sm">
              <XCircle size={16} className="mt-0.5 shrink-0" />{error}
            </div>
          )}

          {result && (
            <div className="space-y-6">
              {/* Status banner */}
              <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium',
                isClean ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                {isClean ? <><CheckCircle size={16} />{result.filename} looks good</>
                  : <><AlertTriangle size={16} />{result.filename} has issues</>}
              </div>

              {/* Missing columns */}
              {result.missingColumns.length > 0 && (
                <section className="space-y-1.5">
                  <SectionTitle color="red">Missing required columns</SectionTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {result.missingColumns.map((c) => (
                      <span key={c} className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-mono">{c}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* Summary stats */}
              <section className="space-y-3">
                <SectionTitle>Summary</SectionTitle>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Total variants" value={result.totalRows.toLocaleString()} />
                  <Stat label="Position range" value={`${result.posMin}–${result.posMax}`} />
                  <Stat label="Positions covered" value={result.sortedPositions.length.toLocaleString()} />
                </div>
                <div className="space-y-1.5">
                  {Object.entries(result.typeCounts).sort(([, a], [, b]) => b - a).map(([type, count]) => {
                    const pct = Math.round((count / result.totalRows) * 100)
                    const valid = VALID_MUTATION_TYPES.has(type)
                    return (
                      <div key={type} className="flex items-center gap-2 text-xs">
                        <span className={cn('w-24 shrink-0 font-medium', valid ? 'text-gray-700' : 'text-red-600')}>
                          {valid ? (MUTATION_TYPE_LABELS[type] ?? type) : `"${type}" ⚠`}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className={cn('h-2 rounded-full', valid ? 'bg-brand' : 'bg-red-400')} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-20 text-right text-gray-500">{count.toLocaleString()} ({pct}%)</span>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Sequence context */}
              {result.sortedPositions.length > 0 && (
                <section className="space-y-4">
                  <SectionTitle>Sequence context</SectionTitle>

                  {/* Coverage ribbon */}
                  <CoverageRibbon
                    sortedPositions={result.sortedPositions}
                    posMin={result.posMin} posMax={result.posMax}
                    positionMap={result.positionMap}
                    windowStart={windowStart}
                    onNavigate={navigateTo}
                  />

                  {/* Window navigator */}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => navigate(-WINDOW_SIZE)}
                      className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                      disabled={windowStart <= result.posMin}>
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs text-gray-500">
                      Positions{' '}
                      <input
                        type="number"
                        value={windowStart}
                        min={result.posMin}
                        max={result.posMax - WINDOW_SIZE + 1}
                        onChange={(e) => navigateTo(parseInt(e.target.value) || result.posMin)}
                        className="w-16 text-center border border-gray-200 rounded px-1 py-0.5 text-xs font-mono mx-1"
                      />
                      – {Math.min(windowStart + WINDOW_SIZE - 1, result.posMax)}
                    </span>
                    <button type="button" onClick={() => navigate(WINDOW_SIZE)}
                      className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                      disabled={windowStart + WINDOW_SIZE > result.posMax}>
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {/* Substitution grid */}
                  <SubstitutionGrid
                    positionMap={result.positionMap}
                    windowStart={windowStart}
                    allPositions={result.sortedPositions}
                    posMin={result.posMin}
                    posMax={result.posMax}
                  />
                </section>
              )}

              {/* Empty cells */}
              {Object.keys(result.emptyCells).length > 0 && (
                <section className="space-y-1.5">
                  <SectionTitle>Empty cells per column</SectionTitle>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(result.emptyCells).map(([col, n]) => (
                      <div key={col} className="flex justify-between text-xs bg-amber-50 rounded px-2.5 py-1">
                        <span className="font-mono text-gray-700">{col}</span>
                        <span className="text-amber-700 font-medium">{n.toLocaleString()} empty</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Row issues */}
              {result.rowIssues.length > 0 && (
                <section className="space-y-1.5">
                  <SectionTitle color="red">Row issues (first {result.rowIssues.length} shown)</SectionTitle>
                  <div className="space-y-1.5">
                    {result.rowIssues.map((issue) => (
                      <div key={issue.row} className="bg-red-50 rounded-lg px-3 py-2 text-xs">
                        <p className="font-medium text-red-700">Row {issue.row}: {issue.name}</p>
                        <ul className="mt-0.5 space-y-0.5 text-red-600">
                          {issue.problems.map((p) => <li key={p}>• {p}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function SectionTitle({ children, color = 'gray' }: { children: React.ReactNode; color?: 'gray' | 'red' }) {
  return (
    <p className={cn('text-xs font-semibold uppercase tracking-wide',
      color === 'red' ? 'text-red-600' : 'text-gray-500')}>
      {children}
    </p>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
    </div>
  )
}
