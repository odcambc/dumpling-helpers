import type { TrackSegment } from '@dumplingkit/ui'
import type { ConfigFormValues } from '@/schemas/config'

// Pure config → diagram model: the barcode cassette (from flanking_sequence) and
// the ORF (from orf coords). Both are features of the amplicon reference; their
// absolute positions / total reference length need the FASTA, so each is drawn
// as its own track rather than to a shared scale.

export interface CassetteModel {
  valid: boolean
  note?: string
  segments: TrackSegment[]
}

export interface OrfModel {
  valid: boolean
  note?: string
  segments: TrackSegment[]
  start: number
  stop: number
  codons: number
  inFrame: boolean
}

export interface StructureModel {
  cassette: CassetteModel
  orf: OrfModel
  reference: string
}

function parseCassette(flank: string): CassetteModel {
  const parts = flank.split('...')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      valid: false,
      note: 'Use LEFT...RIGHT format (… marks the ~20 bp barcode window).',
      segments: [],
    }
  }
  const [left, right] = parts
  const segments: TrackSegment[] = [
    { key: 'left', label: 'left flank', sublabel: `${left.length} nt`, tone: 'muted', weight: Math.max(left.length, 1) },
    { key: 'barcode', label: 'barcode', sublabel: '~20 bp (N)', tone: 'primary', weight: 20 },
    { key: 'right', label: 'right flank', sublabel: `${right.length} nt`, tone: 'muted', weight: Math.max(right.length, 1) },
  ]
  return { valid: true, segments }
}

function parseOrf(orf: string): OrfModel {
  const empty = { segments: [], start: 0, stop: 0, codons: 0, inFrame: false }
  const m = /^(\d+)-(\d+)$/.exec(orf.trim())
  if (!m) return { valid: false, note: 'Enter ORF coordinates as start-stop (e.g. 198-3237).', ...empty }
  const start = parseInt(m[1], 10)
  const stop = parseInt(m[2], 10)
  if (stop <= start) return { valid: false, note: 'ORF stop must be greater than start.', ...empty, start, stop }

  const nt = stop - start + 1
  const codons = Math.floor(nt / 3)
  const inFrame = nt % 3 === 0
  const fivePrime = start - 1

  const segments: TrackSegment[] = []
  if (fivePrime > 0) {
    segments.push({ key: 'five', label: "5′", sublabel: `1–${start - 1} · ${fivePrime} nt`, tone: 'muted', weight: fivePrime })
  }
  segments.push({
    key: 'orf',
    label: 'ORF',
    sublabel: `${start}–${stop} · ${codons} codons`,
    tone: 'primary',
    weight: nt,
    truncated: !inFrame,
    caption: inFrame ? undefined : '⚠ length not a multiple of 3',
  })
  segments.push({ key: 'three', label: "3′", sublabel: `${stop + 1}– …`, tone: 'muted', weight: Math.max(Math.round(nt * 0.15), 1) })

  return { valid: true, segments, start, stop, codons, inFrame }
}

export function configToStructure(c: ConfigFormValues): StructureModel {
  return {
    cassette: parseCassette(c.flanking_sequence),
    orf: parseOrf(c.orf),
    reference: c.reference || '(reference not set)',
  }
}
