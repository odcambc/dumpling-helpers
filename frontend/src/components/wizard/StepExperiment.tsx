import type { UseFormReturn } from 'react-hook-form'
import type { ConfigFormValues } from '@/schemas/config'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

export function StepExperiment({ form }: Props) {
  const { register, formState: { errors } } = form

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Experiment identity</h2>
        <p className="text-sm text-gray-500 mt-1">
          The experiment name is used to label all output directories and files — choose
          something unique and descriptive.
        </p>
      </div>

      <Field
        label="Experiment name"
        htmlFor="experiment"
        required
        description="Used for naming results directories. No spaces — use underscores."
        error={errors.experiment?.message}
      >
        <Input
          id="experiment"
          placeholder="my_dms_experiment"
          {...register('experiment')}
          error={errors.experiment?.message}
        />
      </Field>

      <Field
        label="Experiment file path"
        htmlFor="experiment_file"
        required
        description="Path to the experiments CSV you'll generate here, relative to the Snakemake root."
        error={errors.experiment_file?.message}
      >
        <Input
          id="experiment_file"
          placeholder="config/my_experiment.csv"
          {...register('experiment_file')}
          error={errors.experiment_file?.message}
        />
      </Field>

      <Field
        label="Baseline condition name"
        htmlFor="baseline_condition"
        hint="optional"
        description="Samples in this condition are used for library QC only — no variant scores are generated for them."
        error={errors.baseline_condition?.message}
      >
        <Input
          id="baseline_condition"
          placeholder="baseline"
          {...register('baseline_condition')}
        />
      </Field>
    </div>
  )
}
