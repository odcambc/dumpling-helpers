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

// Array → comma-separated string (the form represents list fields as strings).
function asList(v: unknown): string {
  if (Array.isArray(v)) return (v as unknown[]).map(String).join(',')
  if (typeof v === 'string') return v
  return ''
}

/**
 * Parse a FUSILLI config.yaml into a fully-formed set of form values by overlaying
 * recognised keys onto the defaults. The form shape mirrors the YAML, except
 * `contaminants` and `variant_retained[].partners` are comma-strings in the UI.
 */
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
  const fl = (r.fusion_library ?? {}) as Record<string, any>
  const ret = (fl.retained ?? {}) as Record<string, any>
  const det = (r.detection ?? {}) as Record<string, any>
  const seq = (r.sequencing ?? {}) as Record<string, any>
  const pre = (r.preprocessing ?? {}) as Record<string, any>
  const qc = (r.qc ?? {}) as Record<string, any>
  const pipe = (r.pipeline ?? {}) as Record<string, any>
  const res = (r.resources ?? {}) as Record<string, any>
  const quick = (r.quick ?? {}) as Record<string, any>

  const variant_retained = Array.isArray(fl.variant_retained)
    ? (fl.variant_retained as any[]).map((v) => ({
        name: String(v?.name ?? ''),
        all_partners: Boolean(v?.all_partners ?? false),
        partners: asList(v?.partners),
        description: String(v?.description ?? ''),
      }))
    : d.fusion_library.variant_retained

  const config: ConfigFormValues = {
    experiment: String(r.experiment ?? d.experiment),
    data_dir: String(r.data_dir ?? d.data_dir),
    ref_dir: String(r.ref_dir ?? d.ref_dir),
    samples_file: String(r.samples_file ?? d.samples_file),
    fusion_library: {
      retained: {
        name: String(ret.name ?? d.fusion_library.retained.name),
        position: ret.position ?? d.fusion_library.retained.position,
        truncated_component:
          ret.truncated_component ?? d.fusion_library.retained.truncated_component,
      },
      linker_sequence: String(fl.linker_sequence ?? d.fusion_library.linker_sequence),
      partners_file: String(fl.partners_file ?? d.fusion_library.partners_file),
      sequences_file: String(fl.sequences_file ?? d.fusion_library.sequences_file),
      variant_retained,
      unfused_sequences_file: String(fl.unfused_sequences_file ?? ''),
      exon_partners_file: String(fl.exon_partners_file ?? ''),
    },
    detection: {
      method: det.method ?? d.detection.method,
      breakpoint_window: Number(det.breakpoint_window ?? d.detection.breakpoint_window),
      maintain_frame: Boolean(det.maintain_frame ?? d.detection.maintain_frame),
      kmer_size: Number(det.kmer_size ?? d.detection.kmer_size),
      orientation_check: Boolean(det.orientation_check ?? d.detection.orientation_check),
      prefilter_fallback: Boolean(det.prefilter_fallback ?? d.detection.prefilter_fallback),
      unmerged_detection: Boolean(det.unmerged_detection ?? d.detection.unmerged_detection),
    },
    sequencing: {
      paired: Boolean(seq.paired ?? d.sequencing.paired),
      min_quality: Number(seq.min_quality ?? d.sequencing.min_quality),
    },
    preprocessing: {
      adapters: String(pre.adapters ?? d.preprocessing.adapters),
      contaminants:
        pre.contaminants !== undefined ? asList(pre.contaminants) : d.preprocessing.contaminants,
    },
    qc: {
      run_qc: Boolean(qc.run_qc ?? d.qc.run_qc),
      baseline_condition: String(qc.baseline_condition ?? d.qc.baseline_condition),
      mem_fastqc: Number(qc.mem_fastqc ?? d.qc.mem_fastqc),
    },
    pipeline: {
      show_progress: Boolean(pipe.show_progress ?? d.pipeline.show_progress),
      progress_interval: Number(pipe.progress_interval ?? d.pipeline.progress_interval),
    },
    resources: {
      memory_mb: Number(res.memory_mb ?? d.resources.memory_mb),
      threads: Number(res.threads ?? d.resources.threads),
    },
    quick: {
      enabled: Boolean(quick.enabled ?? d.quick.enabled),
      max_reads: Number(quick.max_reads ?? d.quick.max_reads),
      fraction: quick.fraction == null ? null : Number(quick.fraction),
      seed: Number(quick.seed ?? d.quick.seed),
    },
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
  for (const req of ['sample', 'condition', 'file']) {
    if (!headers.includes(req)) warnings.push(`Missing "${req}" column`)
  }
  const rows: SampleRowValues[] = result.data.map((row) => ({
    id: crypto.randomUUID(),
    sample: (row.sample ?? '').trim(),
    condition: (row.condition ?? '').trim(),
    replicate: parseInt(row.replicate ?? '1', 10) || 1,
    time: (row.time ?? '0').trim() || '0',
    tile: (row.tile ?? '1').trim() || '1',
    file: (row.file ?? '').trim(),
  }))
  return { rows, warnings }
}
