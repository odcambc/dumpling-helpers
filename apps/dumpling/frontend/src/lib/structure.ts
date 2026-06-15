import type { TrackSegment } from '@dumplingkit/ui'
import type { ConfigFormValues } from '@/schemas/config'

// Pure config → reference/ORF diagram model. Derivable from the form alone;
// the reference's total length (the 3′ end) needs the FASTA, so it's drawn as
// an open-ended trailing region rather than to scale.

export interface OrfStructure {
  valid: boolean
  note?: string
  segments: TrackSegment[]
  start: number
  stop: number
  codons: number
  inFrame: boolean
  reference: string
}

export function configToStructure(c: ConfigFormValues): OrfStructure {
  const reference = c.reference || '(reference not set)'
  const empty = { segments: [], start: 0, stop: 0, codons: 0, inFrame: false, reference }

  const m = /^(\d+)-(\d+)$/.exec(c.orf.trim())
  if (!m) {
    return { valid: false, note: 'Enter ORF coordinates as start-stop (e.g. 141-1568).', ...empty }
  }
  const start = parseInt(m[1], 10)
  const stop = parseInt(m[2], 10)
  if (stop <= start) {
    return { valid: false, note: 'ORF stop must be greater than start.', ...empty, start, stop }
  }

  const nt = stop - start + 1
  const codons = Math.floor(nt / 3)
  const inFrame = nt % 3 === 0
  const fivePrime = start - 1

  const segments: TrackSegment[] = []
  if (fivePrime > 0) {
    segments.push({
      key: 'five',
      label: "5′",
      sublabel: `1–${start - 1} · ${fivePrime} nt`,
      tone: 'muted',
      weight: fivePrime,
    })
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
  segments.push({
    key: 'three',
    label: "3′",
    sublabel: `${stop + 1}– …`,
    tone: 'muted',
    weight: Math.max(Math.round(nt * 0.15), 1),
  })

  return { valid: true, segments, start, stop, codons, inFrame, reference }
}
