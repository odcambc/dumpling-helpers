import { useWatch, type UseFormReturn } from 'react-hook-form'
import type { ConfigFormValues } from '@/schemas/config'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { Collapsible } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

export function StepPipeline({ form }: Props) {
  const { register, setValue, control } = form
  const enrich2 = useWatch({ control, name: 'enrich2' })
  const backend = useWatch({ control, name: 'scoring_backend' })
  const removeZeros = useWatch({ control, name: 'remove_zeros' })
  const runQc = useWatch({ control, name: 'run_qc' })
  const noprocess = useWatch({ control, name: 'noprocess' })
  const samtools = useWatch({ control, name: 'samtools_local' })
  const rosaceLocal = useWatch({ control, name: 'rosace_local' })
  const lilaceLocal = useWatch({ control, name: 'lilace_local' })
  const bgzip = useWatch({ control, name: 'bbtools_use_bgzip' })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Pipeline options</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure variant scoring, QC, and processing behaviour.
        </p>
      </div>

      {/* Scoring backend */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Scoring backend</p>
        <div className="flex gap-3">
          {(['rosace', 'lilace'] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setValue('scoring_backend', b)}
              className={cn(
                'flex-1 rounded-lg border-2 p-3 text-sm font-medium transition-colors text-left',
                backend === b
                  ? 'border-brand bg-brand-light text-brand-dark'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300',
              )}
            >
              <span className="capitalize">{b}</span>
              <span className="block text-xs font-normal mt-0.5 text-gray-500">
                {b === 'rosace'
                  ? 'Growth-based experiments (CmdStanR). Default.'
                  : 'Alternative Bayesian scoring backend.'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Toggle
          checked={enrich2}
          onChange={(v) => setValue('enrich2', v)}
          label="Run Enrich2"
          description="Run Enrich2 in addition to the selected scoring backend."
        />

        <div className={cn('pl-11 transition-opacity', !enrich2 && 'opacity-40 pointer-events-none')}>
          <Toggle
            checked={removeZeros}
            onChange={(v) => setValue('remove_zeros', v)}
            label="Remove zero-count variants before Enrich2"
            description="Variants with zero observations are excluded from Enrich2 input."
            disabled={!enrich2}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-gray-100 pt-4">
        <Toggle
          checked={runQc}
          onChange={(v) => setValue('run_qc', v)}
          label="Run QC (FastQC + MultiQC)"
          description="Generate quality control reports. Disable to speed up re-runs when QC is not needed."
        />

        <Toggle
          checked={noprocess}
          onChange={(v) => setValue('noprocess', v)}
          label="Skip variant filtering"
          description="Do not filter called variants against the designed variants list. Useful for exploratory analysis."
        />
      </div>

      <Collapsible title="Advanced parameters">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max deletion length" hint="codons" description="Maximum codon deletion length in library.">
            <Input type="number" min={1} {...register('max_deletion_length', { valueAsNumber: true })} />
          </Field>
          <Field label="K-mer length" description="K-mer length for BBMap/BBDuk.">
            <Input type="number" min={1} {...register('kmers', { valueAsNumber: true })} />
          </Field>
          <Field label="SAM format" hint="cigar version" description="1.3 uses M; 1.4 uses = or X.">
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              {...register('sam')}
            >
              <option value="1.3">1.3 (recommended)</option>
              <option value="1.4">1.4</option>
            </select>
          </Field>
          <Field label="Min base quality (GATK)" hint="Phred">
            <Input type="number" min={0} max={60} {...register('min_q', { valueAsNumber: true })} />
          </Field>
          <Field label="Min variant observations (GATK)">
            <Input type="number" min={1} {...register('min_variant_obs', { valueAsNumber: true })} />
          </Field>
          <Field label="BBTools memory" hint="GB">
            <Input type="number" min={1} {...register('mem', { valueAsNumber: true })} />
          </Field>
          <Field label="FastQC memory" hint="MB">
            <Input type="number" min={256} {...register('mem_fastqc', { valueAsNumber: true })} />
          </Field>
          <Field label="Rosace memory" hint="MB">
            <Input type="number" min={1000} {...register('mem_rosace', { valueAsNumber: true })} />
          </Field>
          <Field label="Lilace memory" hint="MB">
            <Input type="number" min={1000} {...register('mem_lilace', { valueAsNumber: true })} />
          </Field>
        </div>
      </Collapsible>

      <Collapsible title="Environment / local tool overrides">
        <div className="space-y-3">
          <Toggle
            checked={samtools}
            onChange={(v) => setValue('samtools_local', v)}
            label="Use local samtools"
            description="Use system samtools instead of the conda wrapper. Required on ARM Macs."
          />
          <Toggle
            checked={rosaceLocal}
            onChange={(v) => setValue('rosace_local', v)}
            label="Use local Rosace / R"
            description="Use a locally installed R + Rosace instead of the conda environment."
          />
          <Toggle
            checked={lilaceLocal}
            onChange={(v) => setValue('lilace_local', v)}
            label="Use local Lilace / R"
            description="Use a locally installed R + Lilace instead of the conda environment."
          />
          <Toggle
            checked={bgzip}
            onChange={(v) => setValue('bbtools_use_bgzip', v)}
            label="BBTools: use bgzip"
            description="Disable if your environment hangs in BBTools and you need to fall back to pigz/unpigz."
          />
        </div>
      </Collapsible>
    </div>
  )
}
