import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import type { ConfigFormValues } from '@/schemas/config'
import { Field, Input, Toggle, Button } from '@dumplingkit/ui'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

export function VariantRetainedEditor({ form }: Props) {
  const { register, control, setValue } = form
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'fusion_library.variant_retained',
  })
  const watched = useWatch({ control, name: 'fusion_library.variant_retained' })

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-700">Variant retained domains</p>
        <p className="text-xs text-gray-500">Control fusions that use a different retained domain.</p>
      </div>

      {fields.map((field, i) => {
        const allPartners = watched?.[i]?.all_partners ?? false
        return (
          <div key={field.id} className="rounded-lg border border-gray-200 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Field label="Name" hint="FASTA header">
                  <Input placeholder="Met_Variant" {...register(`fusion_library.variant_retained.${i}.name`)} />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove variant"
                className="mt-7 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <Toggle
              checked={allPartners}
              onChange={(v) => setValue(`fusion_library.variant_retained.${i}.all_partners`, v)}
              label="All partners"
              description="Generate variant fusions against every included partner."
            />

            {!allPartners && (
              <Field label="Partners" hint="comma-separated" description="Partner names to generate variant fusions for.">
                <Input placeholder="TPR, CCDC6" {...register(`fusion_library.variant_retained.${i}.partners`)} />
              </Field>
            )}

            <Field label="Description" hint="optional">
              <Input placeholder="Control fusions" {...register(`fusion_library.variant_retained.${i}.description`)} />
            </Field>
          </div>
        )
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ name: '', all_partners: false, partners: '', description: '' })}
      >
        <Plus size={14} />
        Add variant retained domain
      </Button>
    </div>
  )
}
