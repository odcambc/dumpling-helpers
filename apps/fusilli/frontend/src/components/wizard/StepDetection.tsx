import { useWatch, type UseFormReturn } from 'react-hook-form'
import type { ConfigFormValues } from '@/schemas/config'
import { Field, Input, Toggle } from '@dumplingkit/ui'
import { cn } from '@/lib/utils'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

export function StepDetection({ form }: Props) {
  const { register, setValue, control, formState: { errors } } = form
  const maintainFrame = useWatch({ control, name: 'detection.maintain_frame' })
  const orientation = useWatch({ control, name: 'detection.orientation_check' })
  const prefilter = useWatch({ control, name: 'detection.prefilter_fallback' })
  const paired = useWatch({ control, name: 'sequencing.paired' })
  const quickEnabled = useWatch({ control, name: 'quick.enabled' })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Detection &amp; sequencing</h2>
        <p className="text-sm text-gray-500 mt-1">
          Tune the breakpoint-detection algorithm and sequencing parameters.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Breakpoint window"
          hint="nt each side"
          description="5–50. Larger = more specific, but may miss short-overlap reads."
          error={errors.detection?.breakpoint_window?.message}
        >
          <Input type="number" min={5} max={50} {...register('detection.breakpoint_window', { valueAsNumber: true })} />
        </Field>
        <Field
          label="K-mer size"
          hint="domain-end pre-filter"
          description="8–30. Used to quickly identify candidate partners."
          error={errors.detection?.kmer_size?.message}
        >
          <Input type="number" min={8} max={30} {...register('detection.kmer_size', { valueAsNumber: true })} />
        </Field>
      </div>

      <div className="space-y-3">
        <Toggle
          checked={maintainFrame}
          onChange={(v) => setValue('detection.maintain_frame', v)}
          label="Maintain reading frame"
          description="Only generate breakpoints at codon boundaries (every 3 nt)."
        />
        <Toggle
          checked={orientation}
          onChange={(v) => setValue('detection.orientation_check', v)}
          label="Orientation check"
          description="Also search the reverse complement to gauge orientation issues."
        />
        <Toggle
          checked={prefilter}
          onChange={(v) => setValue('detection.prefilter_fallback', v)}
          label="Prefilter fallback"
          description="Fall back to a full breakpoint scan when the pre-filter misses (slow; debug only)."
        />
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Sequencing</p>
        <Toggle
          checked={paired}
          onChange={(v) => setValue('sequencing.paired', v)}
          label="Paired-end reads"
          description="FUSILLI expects paired-end sequencing."
        />
        <Field
          label="Minimum quality"
          hint="Phred"
          description="0–42. Reads below this quality are filtered."
          error={errors.sequencing?.min_quality?.message}
        >
          <Input type="number" min={0} max={42} className="w-32" {...register('sequencing.min_quality', { valueAsNumber: true })} />
        </Field>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <Toggle
          checked={quickEnabled}
          onChange={(v) => setValue('quick.enabled', v)}
          label="Quick mode (subsample)"
          description="Subsample reads for a fast sanity-check run."
        />
        <div className={cn('grid grid-cols-3 gap-4 transition-opacity', !quickEnabled && 'opacity-40 pointer-events-none')}>
          <Field label="Max reads" description="Per file.">
            <Input type="number" min={1} disabled={!quickEnabled} {...register('quick.max_reads', { valueAsNumber: true })} />
          </Field>
          <Field
            label="Fraction"
            hint="0–1, optional"
            description="Overrides max reads when set."
            error={errors.quick?.fraction?.message}
          >
            <Input
              type="number"
              step="0.01"
              min={0}
              max={1}
              disabled={!quickEnabled}
              {...register('quick.fraction', { setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })}
            />
          </Field>
          <Field label="Seed">
            <Input type="number" disabled={!quickEnabled} {...register('quick.seed', { valueAsNumber: true })} />
          </Field>
        </div>
      </div>
    </div>
  )
}
