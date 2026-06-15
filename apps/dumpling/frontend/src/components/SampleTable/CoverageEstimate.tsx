import { useState } from 'react'
import { ChevronDown, AlertTriangle } from 'lucide-react'
import type { SampleRowValues } from '@/schemas/experiments'
import {
  DEFAULT_READ_LENGTH,
  DEFAULT_TARGET_COVERAGE,
  estimateCoverage,
  summarizeExperimentStructure,
} from '@/lib/coverageEstimate'
import { cn } from '@/lib/utils'

const GBP_WARN_THRESHOLD = 50

interface Props {
  rows: SampleRowValues[]
}

export function CoverageEstimate({ rows }: Props) {
  const [open, setOpen] = useState(false)
  const [variantCount, setVariantCount] = useState<number>(0)
  const [targetCoverage, setTargetCoverage] = useState<number>(DEFAULT_TARGET_COVERAGE)
  const [readLength, setReadLength] = useState<number>(DEFAULT_READ_LENGTH)

  const { conditions, replicates, timepoints } = summarizeExperimentStructure(rows)
  const { readsPerSample, totalReads, gigabases, totalSamples } = estimateCoverage({
    variantCount,
    conditions,
    replicates,
    timepoints,
    targetCoverage,
    readLength,
  })

  const overLaneBudget = gigabases > GBP_WARN_THRESHOLD

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          Coverage estimate
          {!open && totalReads > 0 && (
            <span className="text-xs font-normal text-gray-500">
              ~{formatReads(totalReads)} reads · {gigabases.toFixed(2)} Gbp
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={cn('text-gray-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="px-4 py-4 space-y-4 bg-white">
          <p className="text-xs text-gray-500">
            Estimate reads required to hit a target per-variant depth across all samples in the
            table. Variant count auto-population from <code className="font-mono">designed_variants.csv</code>{' '}
            is planned for a future task.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <NumberField
              label="Variant count"
              value={variantCount}
              onChange={setVariantCount}
              min={0}
              placeholder="e.g. 3000"
            />
            <NumberField
              label="Target coverage (reads/variant)"
              value={targetCoverage}
              onChange={setTargetCoverage}
              min={1}
            />
            <NumberField
              label="Read length (bp)"
              value={readLength}
              onChange={setReadLength}
              min={1}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryStat
              label="Reads / sample"
              value={formatReads(readsPerSample)}
              hint={`${formatNumber(variantCount)} variants × ${formatNumber(targetCoverage)} depth`}
            />
            <SummaryStat
              label="Total reads"
              value={formatReads(totalReads)}
              hint={
                totalSamples > 0
                  ? `${formatNumber(totalSamples)} samples (${conditions} cond × ${replicates} rep × ${timepoints} ${
                      timepoints === 1 ? 'timepoint/bin' : 'timepoints/bins'
                    })`
                  : 'Add rows to derive sample count'
              }
            />
            <SummaryStat
              label="Sequencing output"
              value={`${gigabases.toFixed(2)} Gbp`}
              hint={`@ ${formatNumber(readLength)} bp/read`}
              tone={overLaneBudget ? 'warn' : 'default'}
            />
          </div>

          {overLaneBudget && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
              <span>
                {gigabases.toFixed(1)} Gbp exceeds the ~{GBP_WARN_THRESHOLD} Gbp typical of a
                single sequencing lane. Plan for multiple lanes or a higher-output flow cell.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  placeholder?: string
}

function NumberField({ label, value, onChange, min, placeholder }: NumberFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        type="number"
        min={min}
        value={Number.isFinite(value) && value !== 0 ? value : value === 0 ? '' : ''}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? 0 : Number(v))
        }}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-xs placeholder:text-gray-400 focus:outline-2 focus:outline-offset-0 focus:outline-brand"
      />
    </label>
  )
}

interface SummaryStatProps {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'warn'
}

function SummaryStat({ label, value, hint, tone = 'default' }: SummaryStatProps) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2',
        tone === 'warn'
          ? 'border-amber-200 bg-amber-50'
          : 'border-gray-200 bg-gray-50',
      )}
    >
      <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">{label}</p>
      <p
        className={cn(
          'text-lg font-semibold mt-0.5',
          tone === 'warn' ? 'text-amber-900' : 'text-gray-900',
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('en-US')
}

function formatReads(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return formatNumber(n)
}
