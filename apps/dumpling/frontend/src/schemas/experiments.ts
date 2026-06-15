import { z } from 'zod'

export const sampleRowSchema = z.object({
  id: z.string(),
  sample: z.string().min(1, 'Required'),
  condition: z.string().min(1, 'Required'),
  replicate: z.number().int().min(1, 'Must be ≥ 1'),
  timeOrBin: z.number({ invalid_type_error: 'Required' }),
  tile: z.number().int().min(1).optional(),
  file: z.string().min(1, 'Required'),
})

export type SampleRowValues = z.infer<typeof sampleRowSchema>

export function makeEmptyRow(): SampleRowValues {
  return {
    id: crypto.randomUUID(),
    sample: '',
    condition: '',
    replicate: 1,
    timeOrBin: 0,
    file: '',
  }
}

export function validateSampleTable(
  rows: SampleRowValues[],
): Map<string, string[]> {
  const errors = new Map<string, string[]>()

  const seenSamples = new Set<string>()
  rows.forEach((row, i) => {
    const rowErrors: string[] = []
    const result = sampleRowSchema.safeParse(row)
    if (!result.success) {
      result.error.issues.forEach((issue) => rowErrors.push(issue.message))
    }
    if (seenSamples.has(row.sample)) {
      rowErrors.push('Duplicate sample name')
    } else if (row.sample) {
      seenSamples.add(row.sample)
    }
    if (rowErrors.length > 0) errors.set(String(i), rowErrors)
  })

  return errors
}
