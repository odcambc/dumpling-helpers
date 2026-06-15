import Papa from 'papaparse'

export interface PartnerRow {
  name: string
  include: boolean
}

// FUSILLI fusion partners CSV: columns partner_name, include, description.
export function parsePartnersCsv(text: string): PartnerRow[] {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    comments: '#', // FUSILLI's partners CSV has a leading "#"-comment block
    transformHeader: (h) => h.trim(),
  })
  return result.data
    .map((r) => ({
      name: (r.partner_name ?? r.name ?? '').trim(),
      // include column is true/false; default to included when absent or blank.
      include: !/^(false|0|no|n)$/i.test((r.include ?? 'true').trim()),
    }))
    .filter((p) => p.name)
}
