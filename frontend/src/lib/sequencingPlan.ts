/**
 * Multiplexing extension of the coverage estimator. The base estimator
 * (`coverageEstimate.ts`) keys total reads off conditions × replicates ×
 * timepoints; the sequencing planner uses a single "number of samples" input
 * directly and adds flow-cell, samples-per-flow-cell, and (optional) cost
 * calculations on top.
 */

export interface FlowCellPreset {
  id: string
  label: string
  reads: number
}

/**
 * Common Illumina flow-cell read yields. "custom" is a sentinel; the UI
 * supplies a user-entered read count when the custom preset is selected.
 */
export const FLOW_CELL_PRESETS: FlowCellPreset[] = [
  { id: 'miseq', label: 'MiSeq (~25M reads)', reads: 25_000_000 },
  { id: 'nextseq', label: 'NextSeq (~400M reads)', reads: 400_000_000 },
  { id: 'novaseq', label: 'NovaSeq 6000 (~1.6B reads)', reads: 1_600_000_000 },
  { id: 'custom', label: 'Custom', reads: 0 },
]

/**
 * Multiplexing warning threshold expressed as a target coverage. If the
 * effective per-sample yield drops below `variantCount * UNDER_COVERAGE_X`,
 * the planner flags an under-coverage warning.
 */
export const UNDER_COVERAGE_X = 200

export interface SequencingPlanInputs {
  variantCount: number
  targetCoverage: number
  readLength: number
  samples: number
  readsPerFlowCell: number
  /** Optional cost per flow cell (USD). When > 0, enables cost output. */
  costPerFlowCell?: number
}

export interface SequencingPlanEstimate {
  readsPerSample: number
  totalReads: number
  gigabases: number
  flowCellsNeeded: number
  /** Floor of readsPerFlowCell / readsPerSample (0 if either is 0). */
  samplesPerFlowCell: number
  /** Effective reads each sample receives when packed onto the needed flow cells. */
  effectiveReadsPerSample: number
  /** True when effectiveReadsPerSample drops below UNDER_COVERAGE_X * variantCount. */
  underCoverageWarning: boolean
  /** Total cost (USD), only set when costPerFlowCell > 0. */
  estimatedCost: number | null
}

const safe = (n: number | undefined) =>
  Number.isFinite(n) && (n as number) > 0 ? (n as number) : 0

export function planSequencing(inputs: SequencingPlanInputs): SequencingPlanEstimate {
  const variantCount = safe(inputs.variantCount)
  const targetCoverage = safe(inputs.targetCoverage)
  const readLength = safe(inputs.readLength)
  const samples = safe(inputs.samples)
  const readsPerFlowCell = safe(inputs.readsPerFlowCell)
  const cost = safe(inputs.costPerFlowCell)

  const readsPerSample = variantCount * targetCoverage
  const totalReads = readsPerSample * samples
  const gigabases = (totalReads * readLength) / 1e9

  const flowCellsNeeded =
    readsPerFlowCell > 0 && totalReads > 0 ? Math.ceil(totalReads / readsPerFlowCell) : 0

  const samplesPerFlowCell =
    readsPerSample > 0 && readsPerFlowCell > 0
      ? Math.floor(readsPerFlowCell / readsPerSample)
      : 0

  // Effective reads each sample gets when all `samples` are packed across the
  // computed `flowCellsNeeded`. Falls back to the target readsPerSample when
  // we can't compute a meaningful packing.
  const effectiveReadsPerSample =
    flowCellsNeeded > 0 && samples > 0
      ? Math.floor((flowCellsNeeded * readsPerFlowCell) / samples)
      : readsPerSample

  const warningThreshold = variantCount * UNDER_COVERAGE_X
  const underCoverageWarning =
    variantCount > 0 &&
    samples > 0 &&
    readsPerFlowCell > 0 &&
    effectiveReadsPerSample > 0 &&
    effectiveReadsPerSample < warningThreshold

  const estimatedCost = cost > 0 && flowCellsNeeded > 0 ? flowCellsNeeded * cost : null

  return {
    readsPerSample,
    totalReads,
    gigabases,
    flowCellsNeeded,
    samplesPerFlowCell,
    effectiveReadsPerSample,
    underCoverageWarning,
    estimatedCost,
  }
}
