import { z } from 'zod'

// FUSILLI samples.csv: sample/condition/file required; replicate int (default 1);
// time/tile are strings (per parse_samples_csv — timepoints/tiles can be non-numeric).
export const sampleRowSchema = z.object({
  id: z.string(),
  sample: z.string().min(1, 'Required'),
  condition: z.string().min(1, 'Required'),
  replicate: z.number().int().min(1, 'Must be ≥ 1'),
  time: z.string().default('0'),
  tile: z.string().default('1'),
  file: z.string().min(1, 'Required'),
})

export type SampleRowValues = z.infer<typeof sampleRowSchema>

export function makeEmptyRow(): SampleRowValues {
  return {
    id: crypto.randomUUID(),
    sample: '',
    condition: '',
    replicate: 1,
    time: '0',
    tile: '1',
    file: '',
  }
}

// Human labels for the sample-table columns, so an error reads
// "Sample: Required" rather than a bare "Required" repeated per empty column.
const FIELD_LABELS: Record<string, string> = {
  sample: 'Sample',
  condition: 'Condition',
  replicate: 'Replicate',
  time: 'Time',
  tile: 'Tile',
  file: 'File',
}

export function validateSampleTable(rows: SampleRowValues[]): Map<string, string[]> {
  const errors = new Map<string, string[]>()
  const seen = new Set<string>()
  rows.forEach((row, i) => {
    const rowErrors: string[] = []
    const result = sampleRowSchema.safeParse(row)
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const key = issue.path[0]
        const label = typeof key === 'string' ? (FIELD_LABELS[key] ?? key) : undefined
        rowErrors.push(label ? `${label}: ${issue.message}` : issue.message)
      })
    }
    if (seen.has(row.sample)) rowErrors.push('Duplicate sample name')
    else if (row.sample) seen.add(row.sample)
    if (rowErrors.length > 0) errors.set(String(i), rowErrors)
  })
  return errors
}
