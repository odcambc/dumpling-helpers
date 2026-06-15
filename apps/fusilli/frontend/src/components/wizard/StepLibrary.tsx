import { useWatch, type UseFormReturn } from 'react-hook-form'
import type { ConfigFormValues } from '@/schemas/config'
import { Field, Input, Collapsible } from '@dumplingkit/ui'
import { cn } from '@/lib/utils'
import { VariantRetainedEditor } from './VariantRetainedEditor'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

export function StepLibrary({ form }: Props) {
  const { register, setValue, control, formState: { errors } } = form
  const position = useWatch({ control, name: 'fusion_library.retained.position' })
  const truncated = useWatch({ control, name: 'fusion_library.retained.truncated_component' })
  const flErrors = errors.fusion_library

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Fusion library</h2>
        <p className="text-sm text-gray-500 mt-1">
          Define the retained (constant) domain, the fusion partners, and the reference
          sequences. The partners CSV and reference FASTA are referenced by path — you provide
          them separately.
        </p>
      </div>

      <Field
        label="Retained domain name"
        htmlFor="retained_name"
        required
        description="The constant domain present in every fusion (e.g. the kinase). Must match a header in the reference FASTA."
        error={flErrors?.retained?.name?.message}
      >
        <Input
          id="retained_name"
          placeholder="Met_WT"
          {...register('fusion_library.retained.name')}
          error={flErrors?.retained?.name?.message}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Retained position</p>
          <div className="flex gap-2">
            {(['5prime', '3prime'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setValue('fusion_library.retained.position', p)}
                className={cn(
                  'flex-1 rounded-lg border-2 p-2.5 text-sm font-medium transition-colors',
                  position === p
                    ? 'border-brand bg-brand-light text-brand-dark'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300',
                )}
              >
                {p === '5prime' ? '5′ end' : '3′ end'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Truncated component</p>
          <div className="flex gap-2">
            {(['partner', 'retained'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setValue('fusion_library.retained.truncated_component', t)}
                className={cn(
                  'flex-1 rounded-lg border-2 p-2.5 text-sm font-medium capitalize transition-colors',
                  truncated === t
                    ? 'border-brand bg-brand-light text-brand-dark'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Field
        label="Linker sequence"
        htmlFor="linker"
        hint="optional"
        description="Nucleotide linker between domains (ACGT). Leave blank if none."
        error={flErrors?.linker_sequence?.message}
      >
        <Input
          id="linker"
          placeholder="GGGAGC"
          className="font-mono"
          {...register('fusion_library.linker_sequence')}
          error={flErrors?.linker_sequence?.message}
        />
      </Field>

      <Field
        label="Partners file"
        htmlFor="partners_file"
        required
        description="Path to the fusion partners CSV (partner_name, include, description)."
        error={flErrors?.partners_file?.message}
      >
        <Input
          id="partners_file"
          placeholder="config/fusion_partners.csv"
          {...register('fusion_library.partners_file')}
          error={flErrors?.partners_file?.message}
        />
      </Field>

      <Field
        label="Reference sequences file"
        htmlFor="sequences_file"
        required
        description="Reference FASTA filename in the reference directory (.fasta/.fa/.fna). Contains the retained domain and all partners."
        error={flErrors?.sequences_file?.message}
      >
        <Input
          id="sequences_file"
          placeholder="kinase_sequences.fasta"
          {...register('fusion_library.sequences_file')}
          error={flErrors?.sequences_file?.message}
        />
      </Field>

      <Collapsible title="Optional: controls & variant retained domains">
        <div className="space-y-4">
          <Field
            label="Unfused sequences file"
            htmlFor="unfused"
            hint="optional"
            description="CSV of unfused control sequences for background detection."
            error={flErrors?.unfused_sequences_file?.message}
          >
            <Input
              id="unfused"
              placeholder="config/unfused.csv"
              {...register('fusion_library.unfused_sequences_file')}
              error={flErrors?.unfused_sequences_file?.message}
            />
          </Field>
          <Field
            label="Exon partners file"
            htmlFor="exon"
            hint="optional"
            description="CSV of exon-based partners (only if used)."
            error={flErrors?.exon_partners_file?.message}
          >
            <Input
              id="exon"
              placeholder="config/exon_partners.csv"
              {...register('fusion_library.exon_partners_file')}
              error={flErrors?.exon_partners_file?.message}
            />
          </Field>
          <VariantRetainedEditor form={form} />
        </div>
      </Collapsible>
    </div>
  )
}
