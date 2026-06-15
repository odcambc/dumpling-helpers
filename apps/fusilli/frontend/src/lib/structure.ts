import type { TrackSegment } from '@dumplingkit/ui'
import type { ConfigFormValues } from '@/schemas/config'

// Pure config → diagram model. Schematic from the form alone; when the
// referenced files are supplied (reference FASTA + partners CSV), the real
// fusion set is counted and partner/retained names are validated against the
// FASTA headers (the check FUSILLI's own validate_sequences_match_config runs).

export interface VariantFusionView {
  retained: string
  partners: string
  description?: string
}

export interface Enrichment {
  /** Sequence names present in the reference FASTA. */
  fastaNames?: Set<string>
  /** name → sequence length, for the reference FASTA. */
  fastaLengths?: Map<string, number>
  /** Included partner names parsed from the partners CSV. */
  includedPartners?: string[]
}

export interface StructureModel {
  segments: TrackSegment[] // ordered 5′ → 3′
  truncatedComponent: 'partner' | 'retained'
  linker: string
  partnersSource: string
  variantFusions: VariantFusionView[]
  /** Enrichment (present when the partners CSV was supplied). */
  realPartners?: string[]
  fusionCount?: number
  warnings: string[]
}

function listPartners(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

export function configToStructure(c: ConfigFormValues, e?: Enrichment): StructureModel {
  const fl = c.fusion_library
  const truncated = fl.retained.truncated_component
  const breakpointCaption = '✂ breakpoints scanned'
  const warnings: string[] = []

  const retainedLen = e?.fastaLengths?.get(fl.retained.name)

  const partnerSeg: TrackSegment = {
    key: 'partner',
    label: 'partner',
    sublabel: e?.includedPartners ? `${e.includedPartners.length} partners` : 'from partners file',
    tone: 'accent',
    weight: 3,
    truncated: truncated === 'partner',
    caption: truncated === 'partner' ? breakpointCaption : undefined,
  }
  const retainedSeg: TrackSegment = {
    key: 'retained',
    label: fl.retained.name || 'retained domain',
    sublabel: retainedLen !== undefined ? `${retainedLen} nt` : 'retained',
    tone: 'primary',
    weight: 3,
    truncated: truncated === 'retained',
    caption: truncated === 'retained' ? breakpointCaption : undefined,
  }
  const linkerSeg: TrackSegment | null = fl.linker_sequence
    ? { key: 'linker', label: 'linker', sublabel: fl.linker_sequence, tone: 'muted', weight: 1 }
    : null

  const ordered =
    fl.retained.position === '3prime'
      ? [partnerSeg, linkerSeg, retainedSeg]
      : [retainedSeg, linkerSeg, partnerSeg]

  const variantFusions: VariantFusionView[] = fl.variant_retained.map((v) => ({
    retained: v.name || '(unnamed)',
    partners: v.all_partners
      ? 'all included partners'
      : listPartners(v.partners).join(', ') || '(no partners set)',
    description: v.description || undefined,
  }))

  // ── Enrichment ────────────────────────────────────────────────────────────
  let realPartners: string[] | undefined
  let fusionCount: number | undefined
  if (e?.includedPartners) {
    realPartners = e.includedPartners
    let count = realPartners.length // included partners × the retained domain
    for (const v of fl.variant_retained) {
      count += v.all_partners ? realPartners.length : listPartners(v.partners).length
    }
    fusionCount = count
  }

  if (e?.fastaNames) {
    const names = e.fastaNames
    if (fl.retained.name && !names.has(fl.retained.name)) {
      warnings.push(`Retained domain "${fl.retained.name}" not found in the reference FASTA.`)
    }
    if (e.includedPartners) {
      const missing = e.includedPartners.filter((p) => !names.has(p))
      if (missing.length) {
        warnings.push(
          `${missing.length} partner(s) not in the reference FASTA: ` +
            `${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}.`,
        )
      }
    }
    for (const v of fl.variant_retained) {
      if (v.name && !names.has(v.name)) {
        warnings.push(`Variant retained "${v.name}" not found in the reference FASTA.`)
      }
    }
  }

  return {
    segments: ordered.filter((s): s is TrackSegment => s !== null),
    truncatedComponent: truncated,
    linker: fl.linker_sequence,
    partnersSource: fl.partners_file || '(partners file not set)',
    variantFusions,
    realPartners,
    fusionCount,
    warnings,
  }
}
