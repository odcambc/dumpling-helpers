import { z } from 'zod'

// STROMBOLI experiment CSV: just sample + file (both required).
export const sampleRowSchema = z.object({
  id: z.string(),
  sample: z.string().min(1, 'Required'),
  file: z.string().min(1, 'Required'),
})

export type SampleRowValues = z.infer<typeof sampleRowSchema>

export function makeEmptyRow(): SampleRowValues {
  return { id: crypto.randomUUID(), sample: '', file: '' }
}

export function validateSampleTable(rows: SampleRowValues[]): Map<string, string[]> {
  const errors = new Map<string, string[]>()
  const seen = new Set<string>()
  rows.forEach((row, i) => {
    const rowErrors: string[] = []
    const result = sampleRowSchema.safeParse(row)
    if (!result.success) {
      result.error.issues.forEach((issue) => rowErrors.push(issue.message))
    }
    if (seen.has(row.sample)) rowErrors.push('Duplicate sample name')
    else if (row.sample) seen.add(row.sample)
    if (rowErrors.length > 0) errors.set(String(i), rowErrors)
  })
  return errors
}
