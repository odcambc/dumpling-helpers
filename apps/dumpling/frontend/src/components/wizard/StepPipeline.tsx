import { useWatch, type UseFormReturn } from 'react-hook-form'
import type { ConfigFormValues } from '@/schemas/config'
import { Field, Input, Toggle, Collapsible } from '@dumplingkit/ui'
import { InlineVariantsSummary } from '@/components/VariantsChecker/InlineVariantsSummary'
import { cn } from '@/lib/utils'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

const BACKENDS = [
  { value: 'rosace', label: 'rosace', blurb: 'Growth-based experiments (CmdStanR). Default.' },
  { value: 'lilace', label: 'lilace', blurb: 'Alternative mean-variance Bayesian backend.' },
  { value: 'rosace_aa', label: 'rosace-aa', blurb: 'Position + AA-substitution effect decomposition.' },
] as const

export function StepPipeline({ form }: Props) {
  const { register, setValue, control } = form
  const enrich2 = useWatch({ control, name: 'enrich2' })
  const keepEnrichH5 = useWatch({ control, name: 'keep_enrich_h5' })
  const depositMavedb = useWatch({ control, name: 'deposit_to_mavedb' })
  const runCosmos = useWatch({ control, name: 'run_cosmos' })
  const backend = useWatch({ control, name: 'scoring_backend' })
  const removeZeros = useWatch({ control, name: 'remove_zeros' })
  const runQc = useWatch({ control, name: 'run_qc' })
  const noprocess = useWatch({ control, name: 'noprocess' })
  const samtools = useWatch({ control, name: 'samtools_local' })
  const rosaceLocal = useWatch({ control, name: 'rosace_local' })
  const lilaceLocal = useWatch({ control, name: 'lilace_local' })
  const rosaceAaLocal = useWatch({ control, name: 'rosace_aa_local' })
  const regenerateVariants = useWatch({ control, name: 'regenerate_variants' })
  const oligoFile = useWatch({ control, name: 'oligo_file' })
  const variantsFile = useWatch({ control, name: 'variants_file' })

  // lilace and rosace_aa need parsed variant metadata, so they can't run with noprocess.
  const backendNeedsProcessing = noprocess && backend !== 'rosace'

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
        <div className="grid grid-cols-3 gap-3">
          {BACKENDS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setValue('scoring_backend', b.value)}
              className={cn(
                'rounded-lg border-2 p-3 text-sm font-medium transition-colors text-left',
                backend === b.value
                  ? 'border-brand bg-brand-light text-brand-dark'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300',
              )}
            >
              <span>{b.label}</span>
              <span className="block text-xs font-normal mt-0.5 text-gray-500">{b.blurb}</span>
            </button>
          ))}
        </div>
        {backendNeedsProcessing && (
          <p className="text-xs text-amber-600 mt-2">
            {backend === 'lilace' ? 'lilace' : 'rosace-aa'} needs processed variants — turn off
            “Skip variant filtering” below, or switch to rosace.
          </p>
        )}
      </div>

      {/* Aligner */}
      <Field
        label="Read aligner"
        description="bbmap emits BBTools histograms; minimap2 (short-read preset) is faster on small DMS references."
      >
        <select
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          {...register('aligner')}
        >
          <option value="bbmap">bbmap (default)</option>
          <option value="minimap2">minimap2</option>
        </select>
      </Field>

      <div className="space-y-3 pt-2">
        <Toggle
          checked={enrich2}
          onChange={(v) => setValue('enrich2', v)}
          label="Run Enrich2"
          description="Run Enrich2 in addition to the selected scoring backend. On by default."
        />

        <div className={cn('pl-11 space-y-3 transition-opacity', !enrich2 && 'opacity-40 pointer-events-none')}>
          <Toggle
            checked={removeZeros}
            onChange={(v) => setValue('remove_zeros', v)}
            label="Remove zero-count variants before Enrich2"
            description="Variants with zero observations are excluded from Enrich2 input."
            disabled={!enrich2}
          />
          <Toggle
            checked={keepEnrichH5}
            onChange={(v) => setValue('keep_enrich_h5', v)}
            label="Keep Enrich2 HDF5 stores"
            description="Retain Enrich2's intermediate .h5 files (for debugging). Deleted after scoring by default."
            disabled={!enrich2}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-gray-100 pt-4">
        <Toggle
          checked={depositMavedb}
          onChange={(v) => setValue('deposit_to_mavedb', v)}
          label="Emit MaveDB deposit CSV"
          description="Write a MaveDB-formatted score CSV per condition, ready to upload. On by default."
        />
        <Toggle
          checked={runCosmos}
          onChange={(v) => setValue('run_cosmos', v)}
          label="Run cosmos"
          description="Direct/indirect per-position decomposition. Needs exactly two conditions with phenotype slots 1 and 2 (set in the sample table). Can add hours on a large library."
        />
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
          description="Do not filter called variants against the designed variants list. Incompatible with lilace / rosace-aa."
        />
      </div>

      <InlineVariantsSummary
        oligoFilePath={oligoFile}
        variantsFilePath={variantsFile}
        regenerateVariants={regenerateVariants}
      />

      <Collapsible title="Advanced parameters">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max deletion length" hint="codons" description="In-frame deletions longer than this are rejected. 0 disables the cap.">
            <Input type="number" min={0} {...register('max_deletion_length', { valueAsNumber: true })} />
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
          <Field label="Lilace seed" hint="blank = random" description="Pin for bit-identical lilace runs; blank derives a fresh seed each run.">
            <Input
              type="number"
              {...register('lilace_seed', {
                setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
              })}
            />
          </Field>
        </div>
        <div className="border-t border-gray-100 pt-4 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Memory allocations</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="BBTools memory" hint="GB">
              <Input type="number" min={1} {...register('mem', { valueAsNumber: true })} />
            </Field>
            <Field label="FastQC memory" hint="MB">
              <Input type="number" min={256} {...register('mem_fastqc', { valueAsNumber: true })} />
            </Field>
            <Field label="BBDuk memory" hint="MB">
              <Input type="number" min={256} {...register('mem_bbduk', { valueAsNumber: true })} />
            </Field>
            <Field label="BBMerge memory" hint="MB">
              <Input type="number" min={256} {...register('mem_bbmerge', { valueAsNumber: true })} />
            </Field>
            <Field label="BBMap memory" hint="MB">
              <Input type="number" min={1000} {...register('mem_bbmap', { valueAsNumber: true })} />
            </Field>
            <Field label="minimap2 memory" hint="MB">
              <Input type="number" min={256} {...register('mem_minimap2', { valueAsNumber: true })} />
            </Field>
            <Field label="GATK memory" hint="MB">
              <Input type="number" min={1000} {...register('mem_gatk', { valueAsNumber: true })} />
            </Field>
            <Field label="Process-sample memory" hint="MB">
              <Input type="number" min={256} {...register('mem_process_sample', { valueAsNumber: true })} />
            </Field>
            <Field label="Rosace memory" hint="MB">
              <Input type="number" min={1000} {...register('mem_rosace', { valueAsNumber: true })} />
            </Field>
            <Field label="rosace-aa memory" hint="MB">
              <Input type="number" min={1000} {...register('mem_rosace_aa', { valueAsNumber: true })} />
            </Field>
            <Field label="Lilace memory" hint="MB">
              <Input type="number" min={1000} {...register('mem_lilace', { valueAsNumber: true })} />
            </Field>
            <Field label="cosmos memory" hint="MB">
              <Input type="number" min={256} {...register('mem_cosmos', { valueAsNumber: true })} />
            </Field>
          </div>
        </div>
        <div className="border-t border-gray-100 pt-4 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resource files</p>
          <Field
            label="Adapters FASTA"
            htmlFor="adapters"
            description="Adapter sequences for BBDuk trimming."
          >
            <Input
              id="adapters"
              placeholder="resources/adapters.fa"
              {...register('adapters')}
            />
          </Field>
          <Field
            label="Contaminant FASTAs"
            htmlFor="contaminants"
            hint="comma-separated"
            description="Contaminant reference files for BBDuk filtering (PhiX, sequencing artifacts, etc.)."
          >
            <Input
              id="contaminants"
              placeholder="resources/sequencing_artifacts.fa.gz,resources/phix174_ill.ref.fa.gz"
              {...register('contaminants')}
            />
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
            checked={rosaceAaLocal}
            onChange={(v) => setValue('rosace_aa_local', v)}
            label="Use local rosace-aa / R"
            description="Use a locally installed R + rosace-aa instead of the conda environment."
          />
          <Field
            label="BBTools compression"
            description="fastq IO backend. pigz parallelizes across threads; bgzip uses BBTools' built-in; none falls back to gzip."
          >
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              {...register('bbtools_compression')}
            >
              <option value="pigz">pigz (default)</option>
              <option value="bgzip">bgzip</option>
              <option value="none">none</option>
            </select>
          </Field>
        </div>
      </Collapsible>
    </div>
  )
}
