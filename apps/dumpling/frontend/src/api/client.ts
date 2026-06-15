import type { ConfigFormValues } from '@/schemas/config'
import type { SampleRowValues } from '@/schemas/experiments'
import type { ExperimentMode } from '@/types'

export interface Capabilities {
  version: string
  filesystem_access: boolean
  snakemake_available: boolean
}

export interface ValidationResult {
  valid: boolean
  errors: Array<{ path?: string; message: string; row?: number }>
}

export interface BrowseEntry {
  name: string
  path: string
  is_dir: boolean
  size: number | null
}

export interface BrowseResult {
  current: string
  parent: string | null
  entries: BrowseEntry[]
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  async capabilities(): Promise<Capabilities> {
    return request<Capabilities>('/api/capabilities')
  },

  async validateConfig(values: ConfigFormValues): Promise<ValidationResult> {
    return request<ValidationResult>('/api/validate/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toConfigPayload(values)),
    })
  },

  async validateExperiments(
    rows: SampleRowValues[],
    mode: ExperimentMode,
    includeTile: boolean,
  ): Promise<ValidationResult> {
    return request<ValidationResult>('/api/validate/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toExperimentsPayload(rows, mode, includeTile)),
    })
  },

  async generate(
    config: ConfigFormValues,
    rows: SampleRowValues[],
    mode: ExperimentMode,
    includeTile: boolean,
  ): Promise<Blob> {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: toConfigPayload(config),
        experiments: toExperimentsPayload(rows, mode, includeTile),
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(body.detail ?? `HTTP ${res.status}`)
    }
    return res.blob()
  },

  async browse(path?: string): Promise<BrowseResult> {
    const params = path ? `?path=${encodeURIComponent(path)}` : ''
    return request<BrowseResult>(`/api/browse${params}`)
  },

  async discover(dataDir: string): Promise<{ data_dir: string; prefixes: string[] }> {
    return request(`/api/discover?data_dir=${encodeURIComponent(dataDir)}`)
  },
}

function toConfigPayload(v: ConfigFormValues) {
  const contaminants = v.contaminants
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return {
    ...v,
    contaminants: contaminants.length === 1 ? contaminants[0] : contaminants,
  }
}

function toSampleRow(row: SampleRowValues, mode: ExperimentMode) {
  const out: Record<string, unknown> = {
    sample: row.sample,
    condition: row.condition,
    replicate: row.replicate,
    file: row.file,
  }
  if (mode === 'timecourse') {
    out.time = row.timeOrBin
  } else {
    out.bin = row.timeOrBin
  }
  if (row.tile !== undefined) out.tile = row.tile
  return out
}

function toExperimentsPayload(
  rows: SampleRowValues[],
  mode: ExperimentMode,
  includeTile: boolean,
) {
  return {
    mode,
    include_tile: includeTile,
    rows: rows.map((r) => toSampleRow(r, mode)),
  }
}
