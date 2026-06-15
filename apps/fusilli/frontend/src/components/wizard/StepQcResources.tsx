import { useWatch, type UseFormReturn } from 'react-hook-form'
import type { ConfigFormValues } from '@/schemas/config'
import { Field, Input, Toggle, Collapsible } from '@dumplingkit/ui'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

export function StepQcResources({ form }: Props) {
  const { register, setValue, control } = form
  const runQc = useWatch({ control, name: 'qc.run_qc' })
  const showProgress = useWatch({ control, name: 'pipeline.show_progress' })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">QC, pipeline &amp; resources</h2>
        <p className="text-sm text-gray-500 mt-1">Quality-control reporting and run resources.</p>
      </div>

      <div className="space-y-3">
        <Toggle
          checked={runQc}
          onChange={(v) => setValue('qc.run_qc', v)}
          label="Run QC (FastQC + MultiQC)"
          description="Generate quality-control reports."
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Baseline condition" description="Condition name used as the comparison baseline.">
            <Input placeholder="baseline" {...register('qc.baseline_condition')} />
          </Field>
          <Field label="FastQC memory" hint="MB">
            <Input type="number" min={1000} {...register('qc.mem_fastqc', { valueAsNumber: true })} />
          </Field>
        </div>
      </div>

      <Collapsible title="Advanced: pipeline & resources">
        <div className="space-y-4">
          <Toggle
            checked={showProgress}
            onChange={(v) => setValue('pipeline.show_progress', v)}
            label="Show progress"
            description="Display progress during long operations."
          />
          <div className="grid grid-cols-3 gap-4">
            <Field label="Progress interval" hint="%">
              <Input type="number" min={1} max={50} {...register('pipeline.progress_interval', { valueAsNumber: true })} />
            </Field>
            <Field label="Memory" hint="MB">
              <Input type="number" min={1000} {...register('resources.memory_mb', { valueAsNumber: true })} />
            </Field>
            <Field label="Threads">
              <Input type="number" min={1} max={128} {...register('resources.threads', { valueAsNumber: true })} />
            </Field>
          </div>
        </div>
      </Collapsible>
    </div>
  )
}
