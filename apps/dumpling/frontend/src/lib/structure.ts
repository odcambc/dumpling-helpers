import type { TrackSegment } from '@dumplingkit/ui'
import type { ConfigFormValues } from '@/schemas/config'

// Config → reference/ORF diagram model. Schematic from config alone; when a
// reference sequence is supplied (the user drops the FASTA), the 3′ region is
// drawn to real scale and codon-level checks are run.

const STOP_CODONS = new Set(['TAA', 'TAG', 'TGA'])

export interface OrfStructure {
  valid: boolean
  note?: string
  segments: TrackSegment[]
  start: number
  stop: number
  codons: number
  inFrame: boolean
  reference: string
  /** Present only when a reference sequence was supplied. */
  refLength?: number
  startCodon?: string
  stopCodon?: string
  warnings: string[]
}

export function configToStructure(c: ConfigFormValues, refSeq?: string): OrfStructure {
  const reference = c.reference || '(reference not set)'
  const warnings: string[] = []
  const base = { segments: [] as TrackSegment[], start: 0, stop: 0, codons: 0, inFrame: false, reference, warnings }

  const m = /^(\d+)-(\d+)$/.exec(c.orf.trim())
  if (!m) return { valid: false, note: 'Enter ORF coordinates as start-stop (e.g. 141-1568).', ...base }
  const start = parseInt(m[1], 10)
  const stop = parseInt(m[2], 10)
  if (stop <= start) return { valid: false, note: 'ORF stop must be greater than start.', ...base, start, stop }

  const nt = stop - start + 1
  const codons = Math.floor(nt / 3)
  const inFrame = nt % 3 === 0
  if (!inFrame) warnings.push('ORF length is not a multiple of 3.')
  const fivePrime = start - 1

  const refLength = refSeq ? refSeq.length : undefined
  let startCodon: string | undefined
  let stopCodon: string | undefined

  if (refSeq) {
    const seq = refSeq.toUpperCase()
    if (start > seq.length) {
      warnings.push(`ORF start ${start} exceeds reference length ${seq.length}.`)
    }
    if (stop > seq.length) {
      warnings.push(`ORF stop ${stop} exceeds reference length ${seq.length}.`)
    } else {
      startCodon = seq.slice(start - 1, start + 2)
      stopCodon = seq.slice(stop - 3, stop)
      if (startCodon !== 'ATG') warnings.push(`ORF does not start with ATG (got ${startCodon}).`)
      if (!STOP_CODONS.has(stopCodon)) warnings.push(`ORF does not end with a stop codon (got ${stopCodon}).`)
    }
  }

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
    caption: inFrame ? undefined : '⚠ not a multiple of 3',
  })
  if (refLength === undefined) {
    // Schematic: unknown 3′ length, drawn as a small open-ended tail.
    segments.push({ key: 'three', label: "3′", sublabel: `${stop + 1}– …`, tone: 'muted', weight: Math.max(Math.round(nt * 0.15), 1) })
  } else {
    const threeLen = refLength - stop
    if (threeLen > 0) {
      segments.push({ key: 'three', label: "3′", sublabel: `${stop + 1}–${refLength} · ${threeLen} nt`, tone: 'muted', weight: threeLen })
    }
  }

  return { valid: true, segments, start, stop, codons, inFrame, reference, refLength, startCodon, stopCodon, warnings }
}
