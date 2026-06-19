import yaml from 'js-yaml'
import Papa from 'papaparse'
import { configDefaults, type ConfigFormValues } from '@/schemas/config'
import { type SampleRowValues } from '@/schemas/experiments'
import type { ExperimentMode } from '@/types'

// Keys we recognise in the YAML config (anything else is silently dropped).
const CONFIG_KEYS = new Set<string>(Object.keys(configDefaults))

export interface ImportedConfig {
  config: Partial<ConfigFormValues>
  warnings: string[]
}

export interface ImportedExperiments {
  rows: SampleRowValues[]
  mode: ExperimentMode
  includeTile: boolean
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
    throw new Error('Config file must be a YAML mapping, not a scalar or list')
  }

  const parsed = raw as Record<string, unknown>
  const config: Partial<ConfigFormValues> = {}

  for (const [key, value] of Object.entries(parsed)) {
    // Deprecated bool → bbtools_compression (matches upstream's translation).
    if (key === 'bbtools_use_bgzip') {
      ;(config as Record<string, unknown>).bbtools_compression = value ? 'bgzip' : 'none'
      warnings.push('Deprecated "bbtools_use_bgzip" mapped to "bbtools_compression"')
      continue
    }

    if (!CONFIG_KEYS.has(key)) {
      warnings.push(`Unknown key "${key}" ignored`)
      continue
    }

    // Normalise contaminants/adapters: array → comma-separated string
    if ((key === 'contaminants' || key === 'adapters') && Array.isArray(value)) {
      ;(config as Record<string, unknown>)[key] = (value as string[]).join(',')
      continue
    }

    ;(config as Record<string, unknown>)[key] = value
  }

  return { config, warnings }
}

export function importExperimentsCsv(text: string): ImportedExperiments {
  const warnings: string[] = []

  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (result.errors.length > 0) {
    const msg = result.errors[0]?.message ?? 'Parse error'
    throw new Error(`CSV parse error: ${msg}`)
  }

  const headers = result.meta.fields ?? []

  const hasTime = headers.includes('time')
  const hasBin = headers.includes('bin')
  const hasTile = headers.includes('tile')
  const hasPhenotype = headers.includes('phenotype')

  if (!hasTime && !hasBin) {
    warnings.push('Neither "time" nor "bin" column found — defaulting to timecourse mode with 0')
  }
  if (hasTime && hasBin) {
    warnings.push('"time" and "bin" columns both present — using "time" (timecourse mode)')
  }

  const mode: ExperimentMode = hasBin && !hasTime ? 'facs' : 'timecourse'

  const rows: SampleRowValues[] = result.data.map((row) => {
    const timeOrBin = hasTime
      ? parseFloat(row.time ?? '0')
      : hasBin
        ? parseInt(row.bin ?? '1', 10)
        : 0

    return {
      id: crypto.randomUUID(),
      sample: (row.sample ?? '').trim(),
      condition: (row.condition ?? '').trim(),
      replicate: parseInt(row.replicate ?? '1', 10) || 1,
      timeOrBin: isNaN(timeOrBin) ? 0 : timeOrBin,
      tile: hasTile ? parseInt(row.tile ?? '1', 10) || 1 : undefined,
      phenotype:
        hasPhenotype && (row.phenotype ?? '').trim() !== ''
          ? parseInt(row.phenotype, 10) || undefined
          : undefined,
      file: (row.file ?? '').trim(),
    }
  })

  return { rows, mode, includeTile: hasTile, warnings }
}
