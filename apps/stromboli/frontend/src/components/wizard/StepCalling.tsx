import { useWatch, type UseFormReturn } from 'react-hook-form'
import type { ConfigFormValues } from '@/schemas/config'
import { Field, Input, Toggle } from '@dumplingkit/ui'
import { cn } from '@/lib/utils'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

const MODES = [
  {
    value: 'double' as const,
    title: 'double',
    blurb: 'Consensus then re-map (depth-1, max precision, depth-agnostic). Default.',
  },
  {
    value: 'single_qc' as const,
    title: 'single_qc',
    blurb: 'Call on the cluster pileup, filter by ALT allele fraction. Keeps depth; needs a depth floor.',
  },
]

export function StepCalling({ form }: Props) {
  const { register, setValue, control, formState: { errors } } = form
  const mode = useWatch({ control, name: 'calling_mode' })
  const useQual = useWatch({ control, name: 'use_qual' })
  const excludeClashes = useWatch({ control, name: 'exclude_clashes' })
  const isQc = mode === 'single_qc'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Variant calling</h2>
        <p className="text-sm text-gray-500 mt-1">
          Per-cluster calling strategy, thresholds, and barcode-clash handling.
        </p>
      </div>

      {/* Calling mode */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Calling mode</p>
        <div className="flex gap-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setValue('calling_mode', m.value)}
              className={cn(
                'flex-1 rounded-lg border-2 p-3 text-sm font-medium transition-colors text-left',
                mode === m.value
                  ? 'border-brand bg-brand-light text-brand-dark'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300',
              )}
            >
              <span className="font-mono">{m.title}</span>
              <span className="block text-xs font-normal mt-0.5 text-gray-500">{m.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Min cluster size" description="Minimum reads in a barcode cluster to call a consensus." error={errors.min_cluster_size?.message}>
          <Input type="number" min={1} {...register('min_cluster_size', { valueAsNumber: true })} />
        </Field>
        <Field label="mpileup max depth" hint="reads" description="Max per-file read depth for bcftools mpileup (-d)." error={errors.mpileup_max_depth?.message}>
          <Input type="number" min={1} {...register('mpileup_max_depth', { valueAsNumber: true })} />
        </Field>
      </div>

      <div className="space-y-3">
        <Toggle
          checked={useQual}
          onChange={(v) => setValue('use_qual', v)}
          label="Weight consensus by base quality"
          description="samtools consensus -q. Down-weights low-quality bases when calling the consensus."
        />
        <Field label="Consensus call fraction" hint="0–1" description="Minimum fraction of reads that must agree to call a consensus base (samtools consensus -c)." error={errors.call_fract?.message}>
          <Input type="number" step="0.05" min={0} max={1} className="w-32" {...register('call_fract', { valueAsNumber: true })} />
        </Field>
      </div>

      {/* single_qc-only thresholds */}
      <div className={cn('border-t border-gray-100 pt-4 space-y-3 transition-opacity', !isQc && 'opacity-40 pointer-events-none')}>
        <p className="text-sm font-medium text-gray-700">
          single_qc thresholds {!isQc && <span className="text-xs font-normal text-gray-400">(used in single_qc mode)</span>}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Min ALT allele fraction" hint="0–1" description="Minimum ALT allele fraction to keep a call." error={errors.qc_min_af?.message}>
            <Input type="number" step="0.05" min={0} max={1} disabled={!isQc} {...register('qc_min_af', { valueAsNumber: true })} />
          </Field>
          <Field label="Min ALT reads" description="Minimum ALT-supporting reads to keep a call." error={errors.qc_min_alt_reads?.message}>
            <Input type="number" min={1} disabled={!isQc} {...register('qc_min_alt_reads', { valueAsNumber: true })} />
          </Field>
        </div>
      </div>

      {/* Clash detection */}
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Barcode clash detection</p>
        <Field label="Merge fraction" hint="0–1" description="Flag a cluster as merged if its 2nd-most-abundant barcode holds at least this fraction of reads." error={errors.clash_merge_fraction?.message}>
          <Input type="number" step="0.05" min={0} max={1} className="w-32" {...register('clash_merge_fraction', { valueAsNumber: true })} />
        </Field>
        <div className={cn('transition-opacity', !isQc && 'opacity-40 pointer-events-none')}>
          <Field label="Mixed AF floor" hint="0–1 · single_qc" description="Variants with this ≤ AF < min ALT fraction mark a barcode as mixed (likely collision)." error={errors.clash_mixed_af?.message}>
            <Input type="number" step="0.05" min={0} max={1} className="w-32" disabled={!isQc} {...register('clash_mixed_af', { valueAsNumber: true })} />
          </Field>
        </div>
        <Toggle
          checked={excludeClashes}
          onChange={(v) => setValue('exclude_clashes', v)}
          label="Exclude flagged barcodes"
          description="Drop merged/mixed barcodes from the final mapping (they're always recorded in the flagged TSV)."
        />
      </div>
    </div>
  )
}
