import { useWatch, type UseFormReturn } from 'react-hook-form'
import type { ConfigFormValues } from '@/schemas/config'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

export function StepPaths({ form }: Props) {
  const { register, control, setValue, formState: { errors } } = form
  const regenerate = useWatch({ control, name: 'regenerate_variants' })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Data & reference paths</h2>
        <p className="text-sm text-gray-500 mt-1">
          All paths are relative to the directory where you invoke Snakemake (the pipeline
          repository root).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Data directory"
          htmlFor="data_dir"
          required
          description="Directory containing all FASTQ files. Must be flat — no subdirectories."
          error={errors.data_dir?.message}
        >
          <Input
            id="data_dir"
            placeholder="data"
            {...register('data_dir')}
            error={errors.data_dir?.message}
          />
        </Field>

        <Field
          label="Reference directory"
          htmlFor="ref_dir"
          required
          description="Directory containing the reference FASTA."
          error={errors.ref_dir?.message}
        >
          <Input
            id="ref_dir"
            placeholder="references"
            {...register('ref_dir')}
            error={errors.ref_dir?.message}
          />
        </Field>
      </div>

      <Field
        label="Reference filename"
        htmlFor="reference"
        required
        description="Must be a nucleotide FASTA file (.fasta, .fa, .fna, …). Just the filename, not the full path."
        error={errors.reference?.message}
      >
        <Input
          id="reference"
          placeholder="my_gene.fasta"
          {...register('reference')}
          error={errors.reference?.message}
        />
      </Field>

      <Field
        label="ORF coordinates"
        htmlFor="orf"
        required
        description="Nucleotide positions of the open reading frame within the reference. Format: start-stop (1-based, inclusive)."
        error={errors.orf?.message}
      >
        <Input
          id="orf"
          placeholder="141-1568"
          className="font-mono"
          {...register('orf')}
          error={errors.orf?.message}
        />
      </Field>

      <div className="pt-2 border-t border-gray-100">
        <Toggle
          checked={regenerate}
          onChange={(v) => setValue('regenerate_variants', v)}
          label="Regenerate variants from oligo file"
          description="Enable if you have a DIMPLE oligo CSV and want the pipeline to generate the variants file automatically."
        />
      </div>

      {regenerate ? (
        <Field
          label="Oligo file"
          htmlFor="oligo_file"
          required
          description="DIMPLE-format oligo CSV used to generate the variants file."
          error={errors.oligo_file?.message}
        >
          <Input
            id="oligo_file"
            placeholder="config/oligos/my_oligos.csv"
            {...register('oligo_file')}
            error={errors.oligo_file?.message}
          />
        </Field>
      ) : (
        <Field
          label="Designed variants file"
          htmlFor="variants_file"
          required
          description="Pre-computed CSV of designed variants (count, pos, mutation_type, name, codon, mutation, length, hgvs)."
          error={errors.variants_file?.message}
        >
          <Input
            id="variants_file"
            placeholder="config/designed_variants/my_variants.csv"
            {...register('variants_file')}
            error={errors.variants_file?.message}
          />
        </Field>
      )}

    </div>
  )
}
