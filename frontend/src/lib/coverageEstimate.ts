import type { SampleRowValues } from '@/schemas/experiments'

export interface CoverageInputs {
  variantCount: number
  conditions: number
  replicates: number
  timepoints: number
  targetCoverage: number
  readLength: number
}

export interface CoverageEstimate {
  readsPerSample: number
  totalSamples: number
  totalReads: number
  gigabases: number
}

export const DEFAULT_TARGET_COVERAGE = 500
export const DEFAULT_READ_LENGTH = 150

/**
 * Estimate sequencing reads required to hit a target per-variant coverage.
 *
 *   readsPerSample = variantCount * targetCoverage
 *   totalSamples   = conditions * replicates * timepoints
 *   totalReads     = readsPerSample * totalSamples
 *   gigabases      = totalReads * readLength / 1e9
 *
 * Any non-positive input collapses to zero output so the UI can render a
 * graceful "fill in the inputs" state.
 */
export function estimateCoverage(inputs: CoverageInputs): CoverageEstimate {
  const { variantCount, conditions, replicates, timepoints, targetCoverage, readLength } = inputs

  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)
  const v = safe(variantCount)
  const c = safe(conditions)
  const r = safe(replicates)
  const t = safe(timepoints)
  const cov = safe(targetCoverage)
  const rl = safe(readLength)

  const readsPerSample = v * cov
  const totalSamples = c * r * t
  const totalReads = readsPerSample * totalSamples
  const gigabases = (totalReads * rl) / 1e9

  return { readsPerSample, totalSamples, totalReads, gigabases }
}

/**
 * Derive the experiment-structure dimensions (unique condition / replicate /
 * timepoint counts) from the sample-table rows. Empty rows still contribute a
 * zero-length count so the estimate falls to 0 until the user enters values.
 */
export function summarizeExperimentStructure(rows: SampleRowValues[]): {
  conditions: number
  replicates: number
  timepoints: number
} {
  const conditions = new Set<string>()
  const replicates = new Set<number>()
  const timepoints = new Set<number>()

  for (const row of rows) {
    if (row.condition) conditions.add(row.condition)
    if (Number.isFinite(row.replicate)) replicates.add(row.replicate)
    if (Number.isFinite(row.timeOrBin)) timepoints.add(row.timeOrBin)
  }

  return {
    conditions: conditions.size,
    replicates: replicates.size,
    timepoints: timepoints.size,
  }
}
