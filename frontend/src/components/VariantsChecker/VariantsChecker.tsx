import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { X, Upload, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const REQUIRED_COLUMNS = ['count', 'pos', 'mutation_type', 'name', 'codon', 'mutation', 'length', 'hgvs']
const VALID_MUTATION_TYPES = new Set(['S', 'M', 'D', 'I', 'X'])
const MUTATION_TYPE_LABELS: Record<string, string> = {
  M: 'Missense', S: 'Synonymous', D: 'Deletion', I: 'Insertion', X: 'Nonsense',
}

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
}

function analyseVariants(rows: VariantRow[], headers: string[]): Omit<CheckResult, 'filename'> {
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c))
  const typeCounts: Record<string, number> = {}
  const emptyCells: Record<string, number> = {}
  const rowIssues: RowIssue[] = []
  let posMin = Infinity, posMax = -Infinity

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const problems: string[] = []

    const pos = parseInt(row.pos, 10)
    if (isNaN(pos)) problems.push(`pos "${row.pos}" is not a number`)
    else { posMin = Math.min(posMin, pos); posMax = Math.max(posMax, pos) }

    if (isNaN(parseInt(row.count, 10))) problems.push(`count "${row.count}" is not a number`)
    if (row.mutation_type && !VALID_MUTATION_TYPES.has(row.mutation_type)) {
      problems.push(`unknown mutation_type "${row.mutation_type}"`)
    }
    if (!row.name?.trim()) problems.push('name is empty')

    const mt = row.mutation_type ?? 'unknown'
    typeCounts[mt] = (typeCounts[mt] ?? 0) + 1

    for (const col of REQUIRED_COLUMNS) {
      if (col === 'codon') continue  // codon is empty for deletions — skip
      if (!row[col]?.trim()) emptyCells[col] = (emptyCells[col] ?? 0) + 1
    }

    if (problems.length > 0 && rowIssues.length < 10) {
      rowIssues.push({ row: i + 2, name: row.name || `(row ${i + 2})`, problems })
    }
  }

  return {
    totalRows: rows.length,
    missingColumns,
    typeCounts,
    posMin: isFinite(posMin) ? posMin : 0,
    posMax: isFinite(posMax) ? posMax : 0,
    emptyCells,
    rowIssues,
  }
}

interface Props {
  open: boolean
  onClose: () => void
}

export function VariantsChecker({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    setResult(null)
    const text = await file.text()
    const parsed = Papa.parse<VariantRow>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() })
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      setError(`CSV parse error: ${parsed.errors[0]?.message}`)
      setLoading(false)
      return
    }
    const headers = parsed.meta.fields ?? []
    const stats = analyseVariants(parsed.data, headers)
    setResult({ filename: file.name, ...stats })
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

  const totalIssueRows = result?.rowIssues.length ?? 0
  const hasIssues = result && (result.missingColumns.length > 0 || totalIssueRows > 0)
  const isClean = result && !hasIssues

  return (
    <>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />}

      {/* Drawer */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Variants file checker</h2>
            <p className="text-xs text-gray-400 mt-0.5">Upload a variants CSV to validate its schema and inspect statistics</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg p-8 cursor-pointer hover:border-brand hover:bg-brand-light transition-colors"
          >
            <Upload size={20} className="text-gray-400" />
            <p className="text-sm text-gray-500">
              {loading ? 'Parsing…' : 'Drop variants CSV here or click to browse'}
            </p>
            <input ref={inputRef} type="file" accept=".csv" className="sr-only" onChange={handleChange} />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-lg p-3 text-sm">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-5">
              {/* Overall status */}
              <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium',
                isClean ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                {isClean
                  ? <><CheckCircle size={16} /> {result.filename} looks good</>
                  : <><AlertTriangle size={16} /> {result.filename} has issues</>}
              </div>

              {/* Missing columns */}
              {result.missingColumns.length > 0 && (
                <section className="space-y-1.5">
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Missing required columns</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.missingColumns.map((c) => (
                      <span key={c} className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-mono">{c}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* Stats */}
              <section className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Summary</p>

                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Total variants" value={result.totalRows.toLocaleString()} />
                  <Stat label="Position range" value={`${result.posMin}–${result.posMax}`} />
                  <Stat label="Mutation types" value={Object.keys(result.typeCounts).filter(k => VALID_MUTATION_TYPES.has(k)).length + ' types'} />
                </div>

                {/* Mutation type breakdown */}
                <div className="space-y-1.5">
                  {Object.entries(result.typeCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => {
                      const pct = Math.round((count / result.totalRows) * 100)
                      const isValid = VALID_MUTATION_TYPES.has(type)
                      return (
                        <div key={type} className="flex items-center gap-2 text-xs">
                          <span className={cn('w-24 shrink-0 font-medium', isValid ? 'text-gray-700' : 'text-red-600')}>
                            {isValid ? (MUTATION_TYPE_LABELS[type] ?? type) : `"${type}" ⚠`}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className={cn('h-2 rounded-full', isValid ? 'bg-brand' : 'bg-red-400')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-16 text-right text-gray-500">
                            {count.toLocaleString()} ({pct}%)
                          </span>
                        </div>
                      )
                    })}
                </div>
              </section>

              {/* Empty cells */}
              {Object.keys(result.emptyCells).length > 0 && (
                <section className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Empty cells per column</p>
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
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                    Row issues (first {result.rowIssues.length} shown)
                  </p>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
    </div>
  )
}
