import { useRef, useState } from 'react'
import { Upload, CheckCircle, AlertTriangle, XCircle, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  validateVariants,
  VALID_MUTATION_TYPES,
  MUTATION_TYPE_LABELS,
  type ValidationResult,
} from '@/lib/validateVariants'

interface Props {
  /** Path the user typed into `oligo_file` — only displayed for context. */
  oligoFilePath: string
}

interface Loaded {
  filename: string
  result: ValidationResult
}

/**
 * Compact inline variants-validation summary embedded in Step 3.
 *
 * The browser cannot read an arbitrary filesystem path (`oligo_file` is just a
 * string the user typed), so we prompt them to drop or pick the same file
 * client-side to get a validation read-out.
 */
export function InlineVariantsSummary({ oligoFilePath }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  async function handleFile(file: File) {
    setParsing(true)
    setError(null)
    setLoaded(null)
    try {
      const text = await file.text()
      const outcome = validateVariants(text)
      if (!outcome.ok) {
        setError(outcome.error)
      } else {
        setLoaded({ filename: file.name, result: outcome.result })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file')
    } finally {
      setParsing(false)
    }
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

  const result = loaded?.result
  const hasIssues = result && (result.missingColumns.length > 0 || result.rowIssues.length > 0)
  const isClean = result && !hasIssues

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">Validate variants file</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Pipeline will regenerate variants from{' '}
            <span className="font-mono text-gray-700">{oligoFilePath}</span>. Drop the
            same CSV here to sanity-check it client-side before running.
          </p>
        </div>
      </div>

      {/* Drop zone / picker */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex items-center gap-2 border-2 border-dashed rounded-md px-3 py-2.5 cursor-pointer text-xs transition-colors',
          loaded
            ? 'border-gray-200 bg-white text-gray-500 hover:border-brand'
            : 'border-gray-300 bg-white text-gray-500 hover:border-brand hover:bg-brand-light',
        )}
      >
        {loaded ? <FileText size={14} /> : <Upload size={14} />}
        <span>
          {parsing
            ? 'Parsing…'
            : loaded
              ? `Loaded ${loaded.filename} — drop another to re-check`
              : 'Drop variants CSV here or click to browse'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={handleChange}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-md p-2.5 text-xs">
          <XCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Status banner */}
          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium',
              isClean ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700',
            )}
          >
            {isClean ? (
              <>
                <CheckCircle size={14} />
                {result.totalRows.toLocaleString()} variants — schema OK
              </>
            ) : (
              <>
                <AlertTriangle size={14} />
                {result.totalRows.toLocaleString()} variants — issues found
              </>
            )}
          </div>

          {/* Missing columns */}
          {result.missingColumns.length > 0 && (
            <div className="text-xs space-y-1">
              <p className="font-semibold text-red-600 uppercase tracking-wide text-[10px]">
                Missing required columns
              </p>
              <div className="flex flex-wrap gap-1">
                {result.missingColumns.map((c) => (
                  <span
                    key={c}
                    className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-mono"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Mutation-type breakdown */}
          {Object.keys(result.typeCounts).length > 0 && (
            <div className="space-y-1">
              <p className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                Mutation types
              </p>
              <div className="space-y-1">
                {Object.entries(result.typeCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => {
                    const pct = result.totalRows > 0
                      ? Math.round((count / result.totalRows) * 100)
                      : 0
                    const valid = VALID_MUTATION_TYPES.has(type)
                    return (
                      <div key={type} className="flex items-center gap-2 text-xs">
                        <span
                          className={cn(
                            'w-20 shrink-0',
                            valid ? 'text-gray-700' : 'text-red-600 font-medium',
                          )}
                        >
                          {valid ? (MUTATION_TYPE_LABELS[type] ?? type) : `"${type}" ⚠`}
                        </span>
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          <div
                            className={cn('h-1.5 rounded-full', valid ? 'bg-brand' : 'bg-red-400')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-20 text-right text-gray-500 tabular-nums">
                          {count.toLocaleString()} ({pct}%)
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Flagged rows */}
          {result.rowIssues.length > 0 && (
            <div className="space-y-1">
              <p className="font-semibold text-red-600 uppercase tracking-wide text-[10px]">
                Flagged rows (first {result.rowIssues.length})
              </p>
              <div className="space-y-1">
                {result.rowIssues.map((issue) => (
                  <div key={issue.row} className="bg-red-50 rounded px-2 py-1 text-xs">
                    <p className="font-medium text-red-700">
                      Row {issue.row}: {issue.name}
                    </p>
                    <ul className="text-red-600 ml-2">
                      {issue.problems.map((p) => (
                        <li key={p}>• {p}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
