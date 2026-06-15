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
          All paths are relative to the directory where you invoke Snakemake (the STROMBOLI
          repository root).
        </p>
      </div>

      <Field
        label="Experiment name"
        htmlFor="experiment"
        required
        description="Used to name output files and the results directory."
        error={errors.experiment?.message}
      >
        <Input id="experiment" placeholder="test_data" {...register('experiment')} error={errors.experiment?.message} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Data directory" htmlFor="data_dir" required description="Directory containing the raw reads." error={errors.data_dir?.message}>
          <Input id="data_dir" placeholder="data" {...register('data_dir')} error={errors.data_dir?.message} />
        </Field>
        <Field label="Reference directory" htmlFor="ref_dir" required description="Directory containing reference FASTA files." error={errors.ref_dir?.message}>
          <Input id="ref_dir" placeholder="references" {...register('ref_dir')} error={errors.ref_dir?.message} />
        </Field>
      </div>

      <Field
        label="Experiment file path"
        htmlFor="experiment_file"
        required
        description="Path to the experiment CSV you'll generate here (sample, file — must end in .csv)."
        error={errors.experiment_file?.message}
      >
        <Input id="experiment_file" placeholder="config/experiments.csv" {...register('experiment_file')} error={errors.experiment_file?.message} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Reference filename" htmlFor="reference" required description="Nucleotide FASTA in the reference directory." error={errors.reference?.message}>
          <Input id="reference" placeholder="amplicon_ref.fasta" {...register('reference')} error={errors.reference?.message} />
        </Field>
        <Field label="Gene name" htmlFor="gene_name" hint="optional" description="Locus name for csq annotation. Defaults to the reference name.">
          <Input id="gene_name" placeholder="gp17" {...register('gene_name')} />
        </Field>
      </div>
    </div>
  )
}
