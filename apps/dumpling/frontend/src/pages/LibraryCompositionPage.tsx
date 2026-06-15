import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FileWarning, Upload } from 'lucide-react'
import {
  COVERAGE_THRESHOLD,
  MUTATION_TYPE_LABELS,
  MUTATION_TYPE_ORDER,
  parseVariants,
} from '@/lib/parseVariants'
import type { ParseSuccess, PositionCoverage } from '@/lib/parseVariants'

interface LoadedFile {
  name: string
  result: ParseSuccess
}

export default function LibraryCompositionPage() {
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    try {
      const text = await file.text()
      const result = parseVariants(text)
      if (!result.ok) {
        setError(result.error)
        setLoaded(null)
        return
      }
      setLoaded({ name: file.name, result })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLoaded(null)
    }
  }, [])

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) void handleFile(f)
      // Reset so picking the same file again triggers `onChange`.
      e.target.value = ''
    },
    [handleFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const f = e.dataTransfer.files?.[0]
      if (f) void handleFile(f)
    },
    [handleFile],
  )

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to wizard
        </Link>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-brand-dark">Library Composition</h1>
            <p className="mt-1 text-sm text-gray-600">
              Inspect a <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">designed_variants.csv</code>{' '}
              file: total counts, mutation-type breakdown, per-position substitution coverage,
              and frameshift indels.
            </p>
          </header>

          <section
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={
              'rounded-lg border-2 border-dashed p-8 text-center transition ' +
              (isDragging
                ? 'border-brand bg-brand-light/30'
                : 'border-gray-300 bg-white hover:border-gray-400')
            }
          >
            <Upload className="mx-auto mb-2 text-gray-400" size={28} />
            <p className="text-sm text-gray-700">
              Drop <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">designed_variants.csv</code> here
            </p>
            <p className="mt-1 text-xs text-gray-500">or</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onPick}
              className="hidden"
            />
            {loaded && (
              <p className="mt-3 text-xs text-gray-500">
                Loaded <span className="font-mono">{loaded.name}</span>
              </p>
            )}
          </section>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <FileWarning size={16} className="mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {loaded && <ResultsPanel result={loaded.result} />}
        </div>
      </div>
    </div>
  )
}

function ResultsPanel({ result }: { result: ParseSuccess }) {
  const total = result.totalRows
  const maxTypeCount = useMemo(
    () => Math.max(1, ...Object.values(result.typeCounts)),
    [result.typeCounts],
  )

  return (
    <div className="mt-6 space-y-6">
      {result.missingColumns.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Missing columns:</strong> {result.missingColumns.join(', ')}. Some metrics may be
          incomplete.
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Summary</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Total variants" value={total.toLocaleString()} />
          <Stat label="Positions covered" value={result.positions.length.toLocaleString()} />
          <Stat
            label="Flagged positions"
            value={result.flaggedPositions.length.toLocaleString()}
            tone={result.flaggedPositions.length > 0 ? 'warn' : 'ok'}
          />
          <Stat
            label="Frameshift indels"
            value={result.frameshiftCount.toLocaleString()}
            tone={result.frameshiftCount > 0 ? 'warn' : 'ok'}
          />
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Mutation type breakdown</h2>
        <p className="mt-1 text-xs text-gray-500">
          Counts per <code>mutation_type</code> value. Unknown / unrecognised buckets are grouped
          under <em>unknown</em>.
        </p>
        <ul className="mt-4 space-y-2">
          {[...MUTATION_TYPE_ORDER, 'unknown'].map((code) => {
            const count = result.typeCounts[code] ?? 0
            if (count === 0 && code === 'unknown') return null
            const label = MUTATION_TYPE_LABELS[code] ?? 'Unknown'
            const widthPct = (count / maxTypeCount) * 100
            return (
              <li key={code} className="flex items-center gap-3">
                <div className="w-28 shrink-0 text-sm text-gray-700">
                  <span className="font-mono text-gray-500">{code}</span>{' '}
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <div className="flex-1 h-5 rounded bg-gray-100">
                  <div
                    className="h-full rounded bg-brand"
                    style={{ width: `${widthPct}%` }}
                    aria-label={`${label}: ${count}`}
                  />
                </div>
                <div className="w-16 shrink-0 text-right text-sm font-mono text-gray-700">
                  {count.toLocaleString()}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Per-position coverage</h2>
          <span className="text-xs text-gray-500">
            Threshold: <strong>{COVERAGE_THRESHOLD}</strong> unique substitutions / position
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          A complete DMS library has ~20 unique substitutions per position. Positions below the
          threshold are highlighted.
        </p>

        {result.positions.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No substitutions found.</p>
        ) : (
          <PositionGrid positions={result.positions} />
        )}
      </section>

      {result.flaggedPositions.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-amber-900">
            Flagged positions ({result.flaggedPositions.length})
          </h2>
          <p className="mt-1 text-xs text-amber-800">
            Positions with fewer than {COVERAGE_THRESHOLD} unique amino-acid substitutions, with
            the absent AAs listed.
          </p>
          <ul className="mt-3 max-h-64 space-y-1 overflow-auto pr-2 font-mono text-xs">
            {result.flaggedPositions.map((p) => (
              <li key={p.pos} className="rounded bg-white/70 px-2 py-1">
                <span className="font-semibold text-amber-900">pos {p.pos}</span>
                <span className="ml-2 text-amber-800">
                  ({p.substitutions.size}/20)
                </span>
                <span className="ml-2 text-gray-600">missing:</span>{' '}
                <span className="text-gray-800">{p.missing.join(' ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function PositionGrid({ positions }: { positions: PositionCoverage[] }) {
  const max = 20
  return (
    <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
      {positions.map((p) => {
        const widthPct = Math.min(100, (p.substitutions.size / max) * 100)
        return (
          <div key={p.pos} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-right font-mono text-xs text-gray-500">
              {p.pos}
            </span>
            <div className="h-3 flex-1 rounded bg-gray-100">
              <div
                className={
                  'h-full rounded ' + (p.flagged ? 'bg-amber-500' : 'bg-brand')
                }
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span
              className={
                'w-10 shrink-0 text-right font-mono text-xs ' +
                (p.flagged ? 'text-amber-700' : 'text-gray-600')
              }
            >
              {p.substitutions.size}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'ok' | 'warn'
}) {
  const toneCls =
    tone === 'warn'
      ? 'text-amber-700'
      : tone === 'ok'
        ? 'text-gray-900'
        : 'text-gray-900'
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={'mt-0.5 text-xl font-semibold ' + toneCls}>{value}</dd>
    </div>
  )
}
