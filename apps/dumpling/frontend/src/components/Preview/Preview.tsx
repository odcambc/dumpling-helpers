import { useMemo } from 'react'
import yaml from 'js-yaml'
import Papa from 'papaparse'
import type { ConfigFormValues } from '@/schemas/config'
import type { SampleRowValues } from '@/schemas/experiments'
import type { ExperimentMode } from '@/types'

interface Props {
  config: ConfigFormValues
  rows: SampleRowValues[]
  mode: ExperimentMode
  includeTile: boolean
  includePhenotype: boolean
}

export function Preview({ config, rows, mode, includeTile, includePhenotype }: Props) {
  const yamlText = useMemo(() => buildYaml(config), [config])
  const csvText = useMemo(
    () => buildCsv(rows, mode, includeTile, includePhenotype),
    [rows, mode, includeTile, includePhenotype],
  )

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      <PreviewPane title="config.yaml" content={yamlText} />
      <PreviewPane title="experiments.csv" content={csvText} />
    </div>
  )
}

function PreviewPane({ title, content }: { title: string; content: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 overflow-hidden min-h-0 flex-1">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
        <span className="text-xs font-semibold text-gray-600 font-mono">{title}</span>
      </div>
      <pre className="overflow-auto flex-1 p-3 text-xs font-mono text-gray-700 leading-relaxed whitespace-pre">
        {content || <span className="text-gray-300 italic">Fill in the form to see a preview…</span>}
      </pre>
    </div>
  )
}

function buildYaml(config: ConfigFormValues): string {
  const data: Record<string, unknown> = {}

  const keys: (keyof ConfigFormValues)[] = [
    'experiment', 'experiment_file', 'data_dir', 'ref_dir', 'reference',
    'variants_file', 'oligo_file', 'orf',
    'scoring_backend', 'aligner', 'enrich2', 'keep_enrich_h5',
    'deposit_to_mavedb', 'run_cosmos', 'remove_zeros', 'regenerate_variants',
    'noprocess', 'run_qc', 'baseline_condition', 'max_deletion_length',
    'kmers', 'sam', 'min_q', 'min_variant_obs', 'lilace_seed',
    'mem', 'mem_fastqc', 'mem_rosace', 'mem_rosace_aa', 'mem_lilace',
    'mem_bbduk', 'mem_bbmerge', 'mem_bbmap', 'mem_minimap2', 'mem_gatk',
    'mem_process_sample', 'mem_cosmos',
    'samtools_local', 'rosace_local', 'lilace_local', 'rosace_aa_local',
    'bbtools_compression', 'adapters', 'contaminants',
  ]

  for (const key of keys) {
    const val = config[key]
    if (val === '' || val === undefined) continue
    if (key === 'contaminants' && typeof val === 'string') {
      const parts = val.split(',').map((s) => s.trim()).filter(Boolean)
      data[key] = parts.length === 1 ? parts[0] : parts
      continue
    }
    if (key === 'remove_zeros' && !config.enrich2) continue
    if (key === 'keep_enrich_h5' && !config.enrich2) continue
    if (key === 'oligo_file' && !config.regenerate_variants) continue
    // lilace_seed defaults to null upstream (fresh seed per run); only emit when pinned.
    if (key === 'lilace_seed' && val === null) continue
    data[key] = val
  }

  try {
    return yaml.dump(data, { lineWidth: 80, sortKeys: false })
  } catch {
    return '# (invalid config — check your inputs)'
  }
}

function buildCsv(
  rows: SampleRowValues[],
  mode: ExperimentMode,
  includeTile: boolean,
  includePhenotype: boolean,
): string {
  if (rows.length === 0) return ''

  const fields = ['sample', 'condition', 'replicate', mode === 'timecourse' ? 'time' : 'bin']
  if (includeTile) fields.push('tile')
  if (includePhenotype) fields.push('phenotype')
  fields.push('file')

  const data = rows.map((r) => {
    const row: Record<string, unknown> = {
      sample: r.sample,
      condition: r.condition,
      replicate: r.replicate,
      [mode === 'timecourse' ? 'time' : 'bin']: r.timeOrBin,
    }
    if (includeTile) row.tile = r.tile ?? 1
    if (includePhenotype) row.phenotype = r.phenotype ?? ''
    row.file = r.file
    return row
  })

  return Papa.unparse(data, { columns: fields, newline: '\n' })
}
