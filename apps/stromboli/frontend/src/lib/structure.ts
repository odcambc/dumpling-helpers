import type { TrackSegment } from '@dumplingkit/ui'
import type { ConfigFormValues } from '@/schemas/config'

// Config → diagram model: barcode cassette (from flanking_sequence) and ORF
// (from orf coords). Schematic from the form alone; when the reference FASTA is
// supplied, the real barcode window is located, the flanks are verified against
// the reference, and the ORF is checked in real context.

const STOP_CODONS = new Set(['TAA', 'TAG', 'TGA'])

export interface CassetteModel {
  valid: boolean
  note?: string
  segments: TrackSegment[]
  warnings: string[]
  barcodeLen?: number
  flanksVerified?: boolean
}

export interface OrfModel {
  valid: boolean
  note?: string
  segments: TrackSegment[]
  start: number
  stop: number
  codons: number
  inFrame: boolean
  refLength?: number
  startCodon?: string
  stopCodon?: string
  warnings: string[]
}

export interface StructureModel {
  cassette: CassetteModel
  orf: OrfModel
  reference: string
  refLength?: number
}

function buildCassette(flank: string, refSeq?: string): CassetteModel {
  const parts = flank.split('...')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, note: 'Use LEFT...RIGHT format (… marks the ~20 bp barcode window).', segments: [], warnings: [] }
  }
  const [left, right] = parts
  const warnings: string[] = []
  let barcodeLen: number | undefined
  let flanksVerified: boolean | undefined

  if (refSeq) {
    const seq = refSeq.toUpperCase()
    const m = /N{2,}/.exec(seq)
    if (!m) {
      warnings.push('No barcode window (run of N) found in the reference FASTA.')
    } else {
      barcodeLen = m[0].length
      const pos = m.index
      const leftOk = seq.slice(Math.max(0, pos - left.length), pos) === left.toUpperCase()
      const rightOk = seq.slice(pos + barcodeLen, pos + barcodeLen + right.length) === right.toUpperCase()
      flanksVerified = leftOk && rightOk
      if (!leftOk) warnings.push('Left flank does not match the reference upstream of the barcode window.')
      if (!rightOk) warnings.push('Right flank does not match the reference downstream of the barcode window.')
    }
  }

  const segments: TrackSegment[] = [
    { key: 'left', label: 'left flank', sublabel: `${left.length} nt`, tone: 'muted', weight: Math.max(left.length, 1) },
    {
      key: 'barcode',
      label: 'barcode',
      sublabel: barcodeLen !== undefined ? `${barcodeLen} bp (N)` : '~20 bp (N)',
      tone: 'primary',
      weight: barcodeLen ?? 20,
    },
    { key: 'right', label: 'right flank', sublabel: `${right.length} nt`, tone: 'muted', weight: Math.max(right.length, 1) },
  ]
  return { valid: true, segments, warnings, barcodeLen, flanksVerified }
}

function buildOrf(orf: string, refSeq?: string): OrfModel {
  const warnings: string[] = []
  const empty = { segments: [] as TrackSegment[], start: 0, stop: 0, codons: 0, inFrame: false, warnings }
  const m = /^(\d+)-(\d+)$/.exec(orf.trim())
  if (!m) return { valid: false, note: 'Enter ORF coordinates as start-stop (e.g. 198-3237).', ...empty }
  const start = parseInt(m[1], 10)
  const stop = parseInt(m[2], 10)
  if (stop <= start) return { valid: false, note: 'ORF stop must be greater than start.', ...empty, start, stop }

  const nt = stop - start + 1
  const codons = Math.floor(nt / 3)
  const inFrame = nt % 3 === 0
  if (!inFrame) warnings.push('ORF length is not a multiple of 3.')
  const fivePrime = start - 1
  const refLength = refSeq?.length
  let startCodon: string | undefined
  let stopCodon: string | undefined

  if (refSeq) {
    const seq = refSeq.toUpperCase()
    if (start > seq.length) warnings.push(`ORF start ${start} exceeds reference length ${seq.length}.`)
    if (stop > seq.length) warnings.push(`ORF stop ${stop} exceeds reference length ${seq.length}.`)
    else {
      startCodon = seq.slice(start - 1, start + 2)
      stopCodon = seq.slice(stop - 3, stop)
      if (startCodon !== 'ATG') warnings.push(`ORF does not start with ATG (got ${startCodon}).`)
      if (!STOP_CODONS.has(stopCodon)) warnings.push(`ORF does not end with a stop codon (got ${stopCodon}).`)
    }
  }

  const segments: TrackSegment[] = []
  if (fivePrime > 0) segments.push({ key: 'five', label: "5′", sublabel: `1–${start - 1} · ${fivePrime} nt`, tone: 'muted', weight: fivePrime })
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
    segments.push({ key: 'three', label: "3′", sublabel: `${stop + 1}– …`, tone: 'muted', weight: Math.max(Math.round(nt * 0.15), 1) })
  } else {
    const t = refLength - stop
    if (t > 0) segments.push({ key: 'three', label: "3′", sublabel: `${stop + 1}–${refLength} · ${t} nt`, tone: 'muted', weight: t })
  }

  return { valid: true, segments, start, stop, codons, inFrame, refLength, startCodon, stopCodon, warnings }
}

export function configToStructure(c: ConfigFormValues, refSeq?: string): StructureModel {
  return {
    cassette: buildCassette(c.flanking_sequence, refSeq),
    orf: buildOrf(c.orf, refSeq),
    reference: c.reference || '(reference not set)',
    refLength: refSeq?.length,
  }
}
