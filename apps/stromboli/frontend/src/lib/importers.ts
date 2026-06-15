import yaml from 'js-yaml'
import Papa from 'papaparse'
import { configDefaults, type ConfigFormValues } from '@/schemas/config'
import type { SampleRowValues } from '@/schemas/samples'

export interface ImportedConfig {
  config: ConfigFormValues
  warnings: string[]
}

export interface ImportedSamples {
  rows: SampleRowValues[]
  warnings: string[]
}

export function importConfigYaml(text: string): ImportedConfig {
  const warnings: string[] = []
  let raw: unknown
  try {
    raw = yaml.load(text)
  } catch (e) {
    throw new Error(`Invalid YAML: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Config file must be a YAML mapping')
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r = raw as Record<string, any>
  const d = configDefaults

  const config: ConfigFormValues = {
    experiment: String(r.experiment ?? d.experiment),
    data_dir: String(r.data_dir ?? d.data_dir),
    ref_dir: String(r.ref_dir ?? d.ref_dir),
    experiment_file: String(r.experiment_file ?? d.experiment_file),
    reference: String(r.reference ?? d.reference),
    gene_name: String(r.gene_name ?? ''),
    orf: String(r.orf ?? d.orf),
    flanking_sequence: String(r.flanking_sequence ?? d.flanking_sequence),
    max_barcode_length: Number(r.max_barcode_length ?? d.max_barcode_length),
    barcode_distance: Number(r.barcode_distance ?? d.barcode_distance),
    calling_mode: r.calling_mode ?? d.calling_mode,
    min_cluster_size: Number(r.min_cluster_size ?? d.min_cluster_size),
    use_qual: Boolean(r.use_qual ?? d.use_qual),
    call_fract: Number(r.call_fract ?? d.call_fract),
    mpileup_max_depth: Number(r.mpileup_max_depth ?? d.mpileup_max_depth),
    qc_min_af: Number(r.qc_min_af ?? d.qc_min_af),
    qc_min_alt_reads: Number(r.qc_min_alt_reads ?? d.qc_min_alt_reads),
    clash_merge_fraction: Number(r.clash_merge_fraction ?? d.clash_merge_fraction),
    clash_mixed_af: Number(r.clash_mixed_af ?? d.clash_mixed_af),
    exclude_clashes: Boolean(r.exclude_clashes ?? d.exclude_clashes),
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { config, warnings }
}

export function importSamplesCsv(text: string): ImportedSamples {
  const warnings: string[] = []
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  if (result.errors.length > 0) {
    throw new Error(`CSV parse error: ${result.errors[0]?.message ?? 'Parse error'}`)
  }
  const headers = result.meta.fields ?? []
  for (const req of ['sample', 'file']) {
    if (!headers.includes(req)) warnings.push(`Missing "${req}" column`)
  }
  const rows: SampleRowValues[] = result.data.map((row) => ({
    id: crypto.randomUUID(),
    sample: (row.sample ?? '').trim(),
    file: (row.file ?? '').trim(),
  }))
  return { rows, warnings }
}
