import type { UseFormReturn } from 'react-hook-form'
import type { ConfigFormValues } from '@/schemas/config'
import { Field, Input } from '@dumplingkit/ui'

interface Props {
  form: UseFormReturn<ConfigFormValues>
}

export function StepBarcode({ form }: Props) {
  const { register, formState: { errors } } = form

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Barcode &amp; ORF</h2>
        <p className="text-sm text-gray-500 mt-1">
          Define the barcode cassette and the ORF within the reference. See the Structure panel for
          a live diagram.
        </p>
      </div>

      <Field
        label="Flanking sequence"
        htmlFor="flanking_sequence"
        required
        description="Constant sequence around the barcode, as LEFT...RIGHT — the literal … marks the barcode window."
        error={errors.flanking_sequence?.message}
      >
        <Input
          id="flanking_sequence"
          placeholder="GCAGTCTGGTGTATGCCTAC...GGTACATTTGAACGCCAAGG"
          className="font-mono"
          {...register('flanking_sequence')}
          error={errors.flanking_sequence?.message}
        />
      </Field>

      <Field
        label="ORF coordinates"
        htmlFor="orf"
        required
        description="Nucleotide positions of the ORF within the reference. Format: start-stop (1-based)."
        error={errors.orf?.message}
      >
        <Input id="orf" placeholder="198-3237" className="font-mono" {...register('orf')} error={errors.orf?.message} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Max barcode length"
          hint="bp"
          description="Reads with a detected barcode at least this long are discarded as spurious (designed barcode is ~20 bp)."
          error={errors.max_barcode_length?.message}
        >
          <Input type="number" min={1} {...register('max_barcode_length', { valueAsNumber: true })} />
        </Field>
        <Field
          label="Barcode clustering distance"
          hint="Levenshtein"
          description="starcode edit distance for clustering barcodes (mismatches + indels)."
          error={errors.barcode_distance?.message}
        >
          <Input type="number" min={0} max={20} {...register('barcode_distance', { valueAsNumber: true })} />
        </Field>
      </div>
    </div>
  )
}
