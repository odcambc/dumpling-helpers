import type { TrackSegment } from '@dumplingkit/ui'
import type { ConfigFormValues } from '@/schemas/config'

// Pure config → diagram model. Everything here is derivable from the form alone;
// the partner set and reference length (which need the referenced files) are
// intentionally left as annotations rather than drawn.

export interface VariantFusionView {
  retained: string
  partners: string
  description?: string
}

export interface StructureModel {
  segments: TrackSegment[] // ordered 5′ → 3′
  truncatedComponent: 'partner' | 'retained'
  linker: string
  partnersSource: string
  variantFusions: VariantFusionView[]
}

export function configToStructure(c: ConfigFormValues): StructureModel {
  const fl = c.fusion_library
  const truncated = fl.retained.truncated_component
  const breakpointCaption = '✂ breakpoints scanned'

  const partnerSeg: TrackSegment = {
    key: 'partner',
    label: 'partner',
    sublabel: 'from partners file',
    tone: 'accent',
    weight: 3,
    truncated: truncated === 'partner',
    caption: truncated === 'partner' ? breakpointCaption : undefined,
  }
  const retainedSeg: TrackSegment = {
    key: 'retained',
    label: fl.retained.name || 'retained domain',
    sublabel: 'retained',
    tone: 'primary',
    weight: 3,
    truncated: truncated === 'retained',
    caption: truncated === 'retained' ? breakpointCaption : undefined,
  }
  const linkerSeg: TrackSegment | null = fl.linker_sequence
    ? { key: 'linker', label: 'linker', sublabel: fl.linker_sequence, tone: 'muted', weight: 1 }
    : null

  // Retained at the 3′ end → partner is 5′ (drawn left); otherwise reversed.
  const ordered =
    fl.retained.position === '3prime'
      ? [partnerSeg, linkerSeg, retainedSeg]
      : [retainedSeg, linkerSeg, partnerSeg]

  const variantFusions: VariantFusionView[] = fl.variant_retained.map((v) => ({
    retained: v.name || '(unnamed)',
    partners: v.all_partners
      ? 'all included partners'
      : v.partners
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .join(', ') || '(no partners set)',
    description: v.description || undefined,
  }))

  return {
    segments: ordered.filter((s): s is TrackSegment => s !== null),
    truncatedComponent: truncated,
    linker: fl.linker_sequence,
    partnersSource: fl.partners_file || '(partners file not set)',
    variantFusions,
  }
}
