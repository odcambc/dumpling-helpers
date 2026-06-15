import type { UseFormReturn } from 'react-hook-form'
import type { ConfigFormValues } from '@/schemas/config'
import { Field, Input } from '@dumplingkit/ui'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

export function StepExperiment({ form }: Props) {
  const { register, formState: { errors } } = form

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Experiment &amp; paths</h2>
        <p className="text-sm text-gray-500 mt-1">
          All paths are relative to the directory where you invoke Snakemake (the FUSILLI
          repository root).
        </p>
      </div>

      <Field
        label="Experiment name"
        htmlFor="experiment"
        required
        description="Used for output paths: results/{experiment}/. Letters, digits, _ and - only."
        error={errors.experiment?.message}
      >
        <Input id="experiment" placeholder="kinase_fusions" {...register('experiment')} error={errors.experiment?.message} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Data directory"
          htmlFor="data_dir"
          required
          description="Directory containing the FASTQ files."
          error={errors.data_dir?.message}
        >
          <Input id="data_dir" placeholder="data" {...register('data_dir')} error={errors.data_dir?.message} />
        </Field>

        <Field
          label="Reference directory"
          htmlFor="ref_dir"
          required
          description="Directory containing reference FASTA files."
          error={errors.ref_dir?.message}
        >
          <Input id="ref_dir" placeholder="references" {...register('ref_dir')} error={errors.ref_dir?.message} />
        </Field>
      </div>

      <Field
        label="Samples file path"
        htmlFor="samples_file"
        required
        description="Path to the samples CSV you'll generate here (must end in .csv)."
        error={errors.samples_file?.message}
      >
        <Input id="samples_file" placeholder="config/samples.csv" {...register('samples_file')} error={errors.samples_file?.message} />
      </Field>
    </div>
  )
}
