import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { SuiteSwitcher, HelpMenu } from '@dumplingkit/ui'
import {
  FLOW_CELL_PRESETS,
  UNDER_COVERAGE_X,
  planSequencing,
} from '@/lib/sequencingPlan'
import { DEFAULT_READ_LENGTH, DEFAULT_TARGET_COVERAGE } from '@/lib/coverageEstimate'

const DEFAULT_PRESET_ID = 'nextseq'

export default function SequencingPlanPage() {
  const [variantCount, setVariantCount] = useState<number>(500)
  const [targetCoverage, setTargetCoverage] = useState<number>(DEFAULT_TARGET_COVERAGE)
  const [readLength, setReadLength] = useState<number>(DEFAULT_READ_LENGTH)
  const [samples, setSamples] = useState<number>(10)
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID)
  const [customReads, setCustomReads] = useState<number>(0)
  const [costPerFlowCell, setCostPerFlowCell] = useState<number>(0)

  const readsPerFlowCell = useMemo(() => {
    if (presetId === 'custom') return customReads
    return FLOW_CELL_PRESETS.find((p) => p.id === presetId)?.reads ?? 0
  }, [presetId, customReads])

  const plan = useMemo(
    () =>
      planSequencing({
        variantCount,
        targetCoverage,
        readLength,
        samples,
        readsPerFlowCell,
        costPerFlowCell,
      }),
    [variantCount, targetCoverage, readLength, samples, readsPerFlowCell, costPerFlowCell],
  )

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to wizard
        </Link>
        <div className="flex items-center gap-2">
          <SuiteSwitcher
            current="sequencing-plan"
            align="right"
            className="w-44"
            renderLink={(to, className, children) => (
              <Link to={to} className={className}>
                {children}
              </Link>
            )}
          />
          <HelpMenu />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-brand-dark">Sequencing Plan</h1>
            <p className="mt-1 text-sm text-gray-600">
              Estimate how many flow cells you need to hit a target per-variant coverage when
              multiplexing samples on Illumina platforms.
            </p>
          </header>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Inputs</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                label="Variants"
                hint="Unique variants in the library"
                value={variantCount}
                onChange={setVariantCount}
                min={0}
              />
              <NumberField
                label="Target coverage (×)"
                hint="Reads per variant per sample"
                value={targetCoverage}
                onChange={setTargetCoverage}
                min={0}
              />
              <NumberField
                label="Read length (bp)"
                value={readLength}
                onChange={setReadLength}
                min={0}
              />
              <NumberField
                label="Samples"
                hint="Number of multiplexed samples"
                value={samples}
                onChange={setSamples}
                min={0}
              />

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Reads per flow cell</label>
                <select
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {FLOW_CELL_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {presetId === 'custom' && (
                  <div className="mt-2">
                    <NumberField
                      label="Custom reads per flow cell"
                      value={customReads}
                      onChange={setCustomReads}
                      min={0}
                    />
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <NumberField
                  label="Cost per flow cell (USD, optional)"
                  hint="Leave at 0 to skip cost estimate"
                  value={costPerFlowCell}
                  onChange={setCostPerFlowCell}
                  min={0}
                />
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Plan</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Reads / sample" value={formatInt(plan.readsPerSample)} />
              <Stat label="Total reads" value={formatInt(plan.totalReads)} />
              <Stat label="Total bases (Gb)" value={plan.gigabases.toFixed(2)} />
              <Stat
                label="Flow cells needed"
                value={plan.flowCellsNeeded.toLocaleString()}
                tone={plan.flowCellsNeeded > 0 ? 'ok' : 'neutral'}
              />
              <Stat
                label="Samples / flow cell"
                value={plan.samplesPerFlowCell.toLocaleString()}
              />
              <Stat
                label="Effective reads / sample"
                value={formatInt(plan.effectiveReadsPerSample)}
                tone={plan.underCoverageWarning ? 'warn' : 'neutral'}
              />
              {plan.estimatedCost !== null && (
                <Stat
                  label="Estimated cost (USD)"
                  value={`$${plan.estimatedCost.toLocaleString()}`}
                />
              )}
            </dl>

            {plan.underCoverageWarning && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  Multiplexing this many samples drops the effective per-sample yield below{' '}
                  <strong>{UNDER_COVERAGE_X}×</strong> coverage on {variantCount.toLocaleString()}{' '}
                  variants. Consider fewer samples per flow cell or a higher-yield platform.
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
}: {
  label: string
  hint?: string
  value: number
  onChange: (n: number) => void
  min?: number
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) ? n : 0)
        }}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
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
    tone === 'warn' ? 'text-amber-700' : tone === 'ok' ? 'text-gray-900' : 'text-gray-900'
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={'mt-0.5 text-xl font-semibold ' + toneCls}>{value}</dd>
    </div>
  )
}

function formatInt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`
  return n.toLocaleString()
}
