import { useRef, useState, useEffect } from 'react'
import { X, Upload, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Genetic code ─────────────────────────────────────────────────────────────

const CODON_TABLE: Record<string, string> = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L',
  CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M',
  GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
  CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
  GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*',
  CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
  GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
  CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
  GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
}

const THREE_TO_ONE: Record<string, string> = {
  Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C',
  Gln: 'Q', Glu: 'E', Gly: 'G', His: 'H', Ile: 'I',
  Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P',
  Ser: 'S', Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V',
  Ter: '*', Stop: '*', Stp: '*',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OligoEntry { id: string; seq: string }

interface ClaimedMutation {
  wt: string   // 1-letter AA
  pos: number  // 1-based amino acid position
  mut: string  // 1-letter AA
}

/**
 * Parsed from `Gene_delete-N_L-P` / `Gene_ins-N_L-P` IDs where
 * L ∈ {3,6,9} is the length in bp and P is the 1-based AA start position.
 */
interface ClaimedIndel {
  type: 'deletion' | 'insertion'
  lengthNt: number
  pos: number
}

/**
 * A nucleotide-level change found by aligning the oligo to the CDS.
 * All positions are 0-based within the CDS sequence.
 */
interface ActualChange {
  cdsNtPos: number         // 0-based nt start of change in CDS
  aaPos: number            // 1-based AA position (floor(cdsNtPos / 3) + 1)
  isCodonAligned: boolean  // cdsNtPos % 3 === 0
  isFrameshift: boolean    // indel not divisible by 3
  type: 'sub' | 'del' | 'ins'
  refBases: string
  oligoBases: string
  wtAa: string | null      // translated ref codon (null if not a clean single-codon change)
  mutAa: string | null     // translated oligo codon (null for del/ins or multi-codon)
}

type OligoStatus = 'pass' | 'warn' | 'fail'

interface OligoResult {
  id: string
  status: OligoStatus
  claimed: ClaimedMutation | null
  claimedIndel: ClaimedIndel | null
  /** 0-based position in the CDS where the oligo aligns. Negative means oligo starts before CDS. */
  cdsAlignPos: number | null
  /** Nucleotide-level changes found in the CDS-overlapping region of the oligo */
  changes: ActualChange[]
  isFrameshift: boolean
  problems: string[]
}

interface ValidationResult {
  refName: string
  cdsStartInRef: number
  /** How the CDS start position was determined */
  cdsStartMethod: 'voted' | 'manual' | 'longest-orf-fallback'
  /** Number of DMS oligo IDs that agreed on this CDS start (only meaningful for 'voted') */
  cdsStartVotes: number
  wtProtein: string
  totalOligos: number
  results: OligoResult[]
}

// ─── File parsers ─────────────────────────────────────────────────────────────

function parseFasta(text: string): { header: string; seq: string } | null {
  const clean = text.replace(/^﻿/, '').trim()
  if (!clean.startsWith('>')) return null
  const nl = clean.indexOf('\n')
  if (nl < 0) return null
  return {
    header: clean.slice(1, nl).trim(),
    seq: clean.slice(nl + 1).replace(/\s/g, ''),
  }
}

function parseOligoCsv(text: string): OligoEntry[] {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .flatMap(line => {
      const comma = line.indexOf(',')
      if (comma < 0) return []
      const id = line.slice(0, comma).trim()
      const seq = line.slice(comma + 1).trim()
      return id && seq ? [{ id, seq }] : []
    })
}

// ─── CDS start detection ──────────────────────────────────────────────────────

function parseClaimedMutation(id: string): ClaimedMutation | null {
  const match = id.match(/_([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})$/)
  if (!match) return null
  const wt = THREE_TO_ONE[match[1]]
  const mut = THREE_TO_ONE[match[3]]
  if (!wt || !mut) return null
  return { wt, pos: parseInt(match[2], 10), mut }
}

function parseClaimedIndel(id: string): ClaimedIndel | null {
  const match = id.match(/_(delete|del|ins|insert)-\d+_(\d+)-(\d+)$/i)
  if (!match) return null
  const keyword = match[1].toLowerCase()
  const type = keyword === 'ins' || keyword === 'insert' ? 'insertion' : 'deletion'
  return { type, lengthNt: parseInt(match[2], 10), pos: parseInt(match[3], 10) }
}

/**
 * Infer the CDS start position in the reference by voting from DMS oligo IDs.
 * Each parseable `Xxx123Yyy` ID claims that position 123 in the WT protein is `Xxx`.
 * The ATG in the reference that agrees with the most such claims wins.
 *
 * This approach is species-agnostic and works even when the reference has
 * upstream ORFs or multiple ATGs — because it uses biological ground truth
 * (the oligo designs themselves) to disambiguate.
 */
function inferCdsStart(
  refUpper: string,
  oligos: OligoEntry[],
): { pos: number; votes: number } {
  // Sample up to 100 oligos; take up to 30 with parseable DMS IDs for voting
  const claims = oligos
    .slice(0, 100)
    .map(o => parseClaimedMutation(o.id))
    .filter((c): c is ClaimedMutation => c !== null)
    .slice(0, 30)

  if (claims.length === 0) return { pos: -1, votes: 0 }

  const votes = new Map<number, number>()
  let i = 0
  while ((i = refUpper.indexOf('ATG', i)) >= 0) {
    let count = 0
    for (const c of claims) {
      const codonStart = i + (c.pos - 1) * 3
      if (codonStart + 3 > refUpper.length) continue
      if (CODON_TABLE[refUpper.slice(codonStart, codonStart + 3)] === c.wt) count++
    }
    if (count > 0) votes.set(i, count)
    i++
  }

  if (votes.size === 0) return { pos: -1, votes: 0 }
  return [...votes.entries()].reduce(
    (best, [pos, v]) => v > best.votes ? { pos, votes: v } : best,
    { pos: -1, votes: 0 },
  )
}

/** Fallback: find the ATG that starts the longest ORF. Used only when no DMS IDs are present. */
function findLongestOrf(refUpper: string): number {
  let bestStart = -1, bestLen = 0, i = 0
  while ((i = refUpper.indexOf('ATG', i)) >= 0) {
    let len = 0
    for (let j = i; j + 2 < refUpper.length; j += 3) {
      if (CODON_TABLE[refUpper.slice(j, j + 3)] === '*') break
      len++
    }
    if (len > bestLen) { bestLen = len; bestStart = i }
    i++
  }
  return bestStart
}

function translate(seq: string, start: number): string {
  let protein = '', i = start
  for (; i + 2 < seq.length; i += 3) {
    const aa = CODON_TABLE[seq.slice(i, i + 3)] ?? '?'
    if (aa === '*') break
    protein += aa
  }
  return protein
}

// ─── K-mer alignment ──────────────────────────────────────────────────────────

const KMER_SIZE = 15

/** Build a position index for every k-mer in the CDS sequence. */
function buildKmerIndex(cdsUpper: string): Map<string, number[]> {
  const index = new Map<string, number[]>()
  for (let i = 0; i + KMER_SIZE <= cdsUpper.length; i++) {
    const kmer = cdsUpper.slice(i, i + KMER_SIZE)
    const hits = index.get(kmer)
    if (hits) hits.push(i)
    else index.set(kmer, [i])
  }
  return index
}

/**
 * Find where an oligo aligns in the CDS using k-mer voting.
 * Each k-mer from the oligo that matches the CDS casts a vote for a particular
 * alignment start position. Adapter k-mers generate no votes.
 *
 * Returns the most-voted 0-based CDS start position of the oligo (may be negative
 * if the oligo's 5' adapter extends before the CDS start), or null if no k-mers matched.
 */
function findOligoAlignPos(
  oligoUpper: string,
  kmerIndex: Map<string, number[]>,
): { pos: number; confidence: number } | null {
  const votes = new Map<number, number>()
  let totalKmers = 0

  for (let i = 0; i + KMER_SIZE <= oligoUpper.length; i++) {
    const kmer = oligoUpper.slice(i, i + KMER_SIZE)
    const cdsPositions = kmerIndex.get(kmer)
    if (!cdsPositions) continue
    for (const cdsPos of cdsPositions) {
      const candidateStart = cdsPos - i
      votes.set(candidateStart, (votes.get(candidateStart) ?? 0) + 1)
    }
    totalKmers++
  }

  if (votes.size === 0) return null

  let bestPos = 0, bestVotes = 0
  for (const [pos, count] of votes) {
    if (count > bestVotes) { bestVotes = count; bestPos = pos }
  }

  // Confidence: fraction of oligo k-mers that agreed on this position
  return { pos: bestPos, confidence: totalKmers > 0 ? bestVotes / totalKmers : 0 }
}

// ─── Mutation identification ──────────────────────────────────────────────────

/**
 * Gapless alignment: find the contiguous region where ref and oligo differ.
 * Works by extending matching prefix and suffix inward from both ends.
 * The middle (refMid, oligoMid) is the mutation site.
 */
function gaplessAlign(ref: string, oligo: string) {
  let prefix = 0
  const maxPrefix = Math.min(ref.length, oligo.length)
  while (prefix < maxPrefix && ref[prefix] === oligo[prefix]) prefix++

  let suffix = 0
  while (
    suffix < ref.length - prefix &&
    suffix < oligo.length - prefix &&
    ref[ref.length - 1 - suffix] === oligo[oligo.length - 1 - suffix]
  ) suffix++

  return {
    prefixLen: prefix,
    refMid: suffix > 0 ? ref.slice(prefix, -suffix) : ref.slice(prefix),
    oligoMid: suffix > 0 ? oligo.slice(prefix, -suffix) : oligo.slice(prefix),
    suffixLen: suffix,
  }
}

function classifyChange(
  cdsNtPos: number,
  refMid: string,
  oligoMid: string,
  cdsContext?: string,
): ActualChange {
  const type: 'sub' | 'del' | 'ins' =
    refMid.length === oligoMid.length ? 'sub' :
    refMid.length > oligoMid.length ? 'del' : 'ins'

  const isCodonAligned = cdsNtPos % 3 === 0
  const sizeDiff = Math.abs(refMid.length - oligoMid.length)
  const isFrameshift = type !== 'sub' && sizeDiff % 3 !== 0
  const aaPos = Math.floor(cdsNtPos / 3) + 1

  let wtAa: string | null = null
  let mutAa: string | null = null

  if (type === 'sub') {
    const codonStart = Math.floor(cdsNtPos / 3) * 3
    const withinSingleCodon = Math.floor((cdsNtPos + refMid.length - 1) / 3) === Math.floor(cdsNtPos / 3)

    if (isCodonAligned && refMid.length === 3) {
      // The gapless diff captured the whole codon
      wtAa = CODON_TABLE[refMid] ?? '?'
      mutAa = CODON_TABLE[oligoMid] ?? '?'
    } else if (withinSingleCodon && cdsContext) {
      // Partial-codon change (e.g. TCT→TGC where the leading T is in the shared prefix).
      // Reconstruct the full ref codon from context, then apply the oligo bases.
      const offset = cdsNtPos - codonStart
      const refCodon = cdsContext.slice(codonStart, codonStart + 3)
      const mutCodon = refCodon.slice(0, offset) + oligoMid + refCodon.slice(offset + refMid.length)
      if (refCodon.length === 3 && mutCodon.length === 3) {
        wtAa = CODON_TABLE[refCodon] ?? '?'
        mutAa = CODON_TABLE[mutCodon] ?? '?'
      }
    }
  }

  return { cdsNtPos, aaPos, isCodonAligned, isFrameshift, type, refBases: refMid, oligoBases: oligoMid, wtAa, mutAa }
}

// ─── Core validation ──────────────────────────────────────────────────────────

function validateOligo(
  id: string,
  rawSeq: string,
  cdsUpper: string,
  kmerIndex: Map<string, number[]>,
): OligoResult {
  const upper = rawSeq.replace(/\s/g, '').toUpperCase()
  const claimed = parseClaimedMutation(id)
  const claimedIndel = claimed ? null : parseClaimedIndel(id)

  const problems: string[] = []
  let status: OligoStatus = 'pass'
  const fail = (m: string) => { problems.push(m); status = 'fail' }
  const warn = (m: string) => { problems.push(m); if (status !== 'fail') status = 'warn' }

  // Step 1: Align to CDS
  const alignment = findOligoAlignPos(upper, kmerIndex)
  if (!alignment) {
    return {
      id, claimed, claimedIndel, cdsAlignPos: null, changes: [],
      isFrameshift: false, status: 'fail',
      problems: ['No k-mer matches found in CDS — verify the correct reference file was loaded'],
    }
  }

  if (alignment.confidence < 0.1) {
    warn(`Low alignment confidence (${(alignment.confidence * 100).toFixed(0)}% of k-mers agreed) — result may be unreliable`)
  }

  const { pos: cdsAlignPos } = alignment

  // Step 2: Extract the CDS-overlapping region
  const oligoStartInCds = Math.max(0, cdsAlignPos)
  const oligoStartInOligo = Math.max(0, -cdsAlignPos)
  const cdsEndPos = Math.min(cdsUpper.length, cdsAlignPos + upper.length)
  const oligoEndPos = oligoStartInOligo + (cdsEndPos - oligoStartInCds)

  const cdsRegion = cdsUpper.slice(oligoStartInCds, cdsEndPos)
  const oligoRegion = upper.slice(oligoStartInOligo, oligoEndPos)

  if (cdsRegion.length === 0) {
    fail('Oligo does not overlap with CDS region')
    return { id, claimed, claimedIndel, cdsAlignPos, changes: [], isFrameshift: false, problems, status }
  }

  // Step 3: Find the mutation site via gapless alignment
  const { prefixLen, refMid, oligoMid } = gaplessAlign(cdsRegion, oligoRegion)

  if (refMid.length === 0 && oligoMid.length === 0) {
    // Perfect match — no changes at all
    if (claimed && claimed.wt !== claimed.mut) {
      fail(`No nucleotide changes found in CDS region but ID claims ${claimed.wt}${claimed.pos}${claimed.mut}`)
    } else if (claimedIndel) {
      fail(`No deletion/insertion found in CDS region for claimed ${claimedIndel.type} at pos ${claimedIndel.pos}`)
    }
    return { id, claimed, claimedIndel, cdsAlignPos, changes: [], isFrameshift: false, problems, status }
  }

  const mutCdsNtPos = oligoStartInCds + prefixLen
  const change = classifyChange(mutCdsNtPos, refMid, oligoMid, cdsUpper)
  const isFrameshift = change.isFrameshift

  if (isFrameshift) {
    fail(
      `Frameshift at CDS nt ${mutCdsNtPos + 1}: ` +
      `${refMid.length}nt→${oligoMid.length}nt (diff ${Math.abs(refMid.length - oligoMid.length)}nt, not divisible by 3)`
    )
  }

  // Codon-boundary misalignment only matters for indels (predicts frameshift start site).
  // Substitutions that sit entirely within one codon are valid regardless of which base changes.
  if (change.type !== 'sub' && !change.isCodonAligned) {
    warn(`Indel starts at CDS nt ${mutCdsNtPos + 1} (frame +${mutCdsNtPos % 3}) — not at a codon boundary`)
  }

  // Step 4: Validate against claimed mutation or indel
  if (claimed) {
    const isSyn = claimed.wt === claimed.mut

    // Direct codon check at the claimed position (more reliable than inferring from gapless align)
    const claimedCdsNtStart = (claimed.pos - 1) * 3
    const oligoCodonStart = claimedCdsNtStart - cdsAlignPos
    if (oligoCodonStart >= 0 && oligoCodonStart + 3 <= upper.length) {
      const oligoCodon = upper.slice(oligoCodonStart, oligoCodonStart + 3)
      const refCodon = cdsUpper.slice(claimedCdsNtStart, claimedCdsNtStart + 3)
      const oligoAa = CODON_TABLE[oligoCodon] ?? '?'
      const refAa = CODON_TABLE[refCodon] ?? '?'

      if (refAa !== claimed.wt) {
        fail(`Position ${claimed.pos}: reference has ${refAa}, ID claims WT is ${claimed.wt} — position shift?`)
      }
      if (isSyn) {
        if (oligoAa !== claimed.wt) {
          fail(
            `Position ${claimed.pos}: claimed synonymous (${claimed.wt}→${claimed.wt}), ` +
            `oligo encodes ${claimed.wt}→${oligoAa} (codon: ${oligoCodon})`
          )
        }
      } else {
        if (oligoAa !== claimed.mut) {
          fail(
            `Position ${claimed.pos}: claimed ${claimed.wt}→${claimed.mut}, ` +
            `oligo encodes ${claimed.wt}→${oligoAa} (codon: ${oligoCodon})`
          )
        }
      }
    } else {
      warn(`Claimed position ${claimed.pos} (CDS nt ${claimedCdsNtStart + 1}–${claimedCdsNtStart + 3}) is outside the oligo's CDS overlap`)
    }

    // Check that the main mutation is at or near the claimed position
    if (change.aaPos !== claimed.pos && Math.abs(change.aaPos - claimed.pos) >= 2) {
      fail(`Position shift: largest mutation block found at AA ${change.aaPos}, claimed ${claimed.pos}`)
    }

  } else if (claimedIndel) {
    const { type: indelType, lengthNt, pos } = claimedIndel
    const expectedCodons = lengthNt / 3

    if (lengthNt % 3 !== 0) {
      fail(`Claimed ${indelType} length ${lengthNt}nt is not divisible by 3 — would cause frameshift`)
    }

    if (change.type !== (indelType === 'deletion' ? 'del' : 'ins')) {
      fail(`Expected ${indelType} but gapless alignment found ${change.type}`)
    } else {
      const actualNt = indelType === 'deletion' ? refMid.length : oligoMid.length
      if (actualNt !== lengthNt) {
        fail(`Claimed ${lengthNt}nt ${indelType} but found ${actualNt}nt`)
      }
      if (Math.abs(change.aaPos - pos) >= 2) {
        fail(`Position shift: claimed ${indelType} at AA ${pos} but found at AA ${change.aaPos}`)
      }
    }
  } else {
    // Unknown ID — report what we found without a specific expected state
    if (change.type === 'sub' && change.wtAa && change.mutAa) {
      warn(`Unparseable ID; found ${change.type} ${change.wtAa}${change.aaPos}${change.mutAa} at CDS nt ${mutCdsNtPos + 1}`)
    } else {
      warn(`Unparseable ID; found ${change.type} (${refMid.length}nt→${oligoMid.length}nt) at CDS nt ${mutCdsNtPos + 1}`)
    }
  }

  return { id, claimed, claimedIndel, cdsAlignPos, changes: [change], isFrameshift, problems, status }
}

function runValidation(
  refText: string,
  csvText: string,
  manualCdsStart?: number,
): ValidationResult {
  const ref = parseFasta(refText)
  if (!ref) throw new Error('Could not parse reference — expected FASTA format (> header line)')

  const refUpper = ref.seq.toUpperCase()
  const oligos = parseOligoCsv(csvText)
  if (oligos.length === 0) throw new Error('No oligos found — expected comma-separated id,sequence (no header row)')

  // Determine CDS start
  let cdsStartInRef: number
  let cdsStartMethod: ValidationResult['cdsStartMethod']
  let cdsStartVotes = 0

  if (manualCdsStart !== undefined) {
    cdsStartInRef = manualCdsStart
    cdsStartMethod = 'manual'
  } else {
    const voted = inferCdsStart(refUpper, oligos)
    if (voted.pos >= 0 && voted.votes >= 2) {
      cdsStartInRef = voted.pos
      cdsStartVotes = voted.votes
      cdsStartMethod = 'voted'
    } else {
      // Fallback: longest ORF — user should verify
      cdsStartInRef = findLongestOrf(refUpper)
      cdsStartMethod = 'longest-orf-fallback'
    }
  }

  if (cdsStartInRef < 0) throw new Error('Could not locate CDS start codon in reference — try specifying it manually')

  const cdsSeq = refUpper.slice(cdsStartInRef)
  const wtProtein = translate(cdsSeq, 0)
  if (wtProtein.length < 5) throw new Error('Reference CDS translates to fewer than 5 amino acids — check the reference file')

  const kmerIndex = buildKmerIndex(cdsSeq)

  return {
    refName: ref.header,
    cdsStartInRef,
    cdsStartMethod,
    cdsStartVotes,
    wtProtein,
    totalOligos: oligos.length,
    results: oligos.map(o => validateOligo(o.id, o.seq, cdsSeq, kmerIndex)),
  }
}

function downloadReport(result: ValidationResult) {
  const header = ['id', 'status', 'claimed', 'claimed_indel', 'cds_align_pos', 'change_type', 'cds_nt_pos', 'aa_pos', 'ref_bases', 'oligo_bases', 'wt_aa', 'mut_aa', 'frameshift', 'problems'].join(',')
  const rows = result.results.map(r => {
    const ch = r.changes[0]
    const cells = [
      r.id,
      r.status,
      r.claimed ? `${r.claimed.wt}${r.claimed.pos}${r.claimed.mut}` : '',
      r.claimedIndel ? `${r.claimedIndel.type} ${r.claimedIndel.lengthNt}nt@${r.claimedIndel.pos}` : '',
      r.cdsAlignPos ?? '',
      ch?.type ?? '',
      ch ? ch.cdsNtPos + 1 : '',
      ch?.aaPos ?? '',
      ch?.refBases ?? '',
      ch?.oligoBases ?? '',
      ch?.wtAa ?? '',
      ch?.mutAa ?? '',
      r.isFrameshift ? 'yes' : 'no',
      r.problems.join(' | '),
    ]
    return cells.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${result.refName.replace(/\s+/g, '_')}-oligo-validation.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── UI components ────────────────────────────────────────────────────────────

function FileZone({
  label, accept, loaded, onFile, inputRef,
}: {
  label: string; accept: string; loaded: string | null
  onFile: (f: File) => void; inputRef: React.RefObject<HTMLInputElement>
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors text-center min-h-[80px]',
        loaded ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-brand hover:bg-brand-light',
      )}
    >
      {loaded ? (
        <>
          <CheckCircle size={15} className="text-green-500 shrink-0" />
          <p className="text-xs font-medium text-green-700">{label}</p>
          <p className="text-[10px] text-green-500 font-mono truncate max-w-full px-1">{loaded}</p>
        </>
      ) : (
        <>
          <Upload size={15} className="text-gray-400 shrink-0" />
          <p className="text-xs font-medium text-gray-600">{label}</p>
          <p className="text-[10px] text-gray-400">Drop or click</p>
        </>
      )}
      <input ref={inputRef} type="file" accept={accept} className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </div>
  )
}

function StatusBadge({ status }: { status: OligoStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0',
      status === 'pass' && 'bg-green-100 text-green-700',
      status === 'warn' && 'bg-amber-100 text-amber-700',
      status === 'fail' && 'bg-red-100 text-red-700',
    )}>
      {status === 'pass' ? <CheckCircle size={9} /> : status === 'warn' ? <AlertTriangle size={9} /> : <XCircle size={9} />}
      {status.toUpperCase()}
    </span>
  )
}

function OligoRow({ result }: { result: OligoResult }) {
  const ch = result.changes[0]
  return (
    <div className={cn(
      'rounded-lg px-3 py-2 text-xs',
      result.status === 'fail' ? 'bg-red-50' : result.status === 'warn' ? 'bg-amber-50' : 'bg-green-50',
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-gray-700 truncate flex-1 min-w-0">{result.id}</span>
        <div className="flex items-center gap-2 shrink-0">
          {result.claimed && (
            <span className="text-gray-400 font-mono text-[10px]">
              {result.claimed.wt}{result.claimed.pos}{result.claimed.mut}
            </span>
          )}
          {result.claimedIndel && (
            <span className="text-gray-400 font-mono text-[10px]">
              {result.claimedIndel.type === 'deletion' ? 'Δ' : '+'}{result.claimedIndel.lengthNt / 3}aa@{result.claimedIndel.pos}
            </span>
          )}
          {ch && result.status !== 'pass' && (
            <span className="font-mono text-[10px] text-gray-500 bg-white px-1 rounded border border-gray-200">
              {ch.refBases.length <= 6 && ch.oligoBases.length <= 6
                ? `${ch.refBases}→${ch.oligoBases}`
                : `${ch.type}@${ch.aaPos}`}
            </span>
          )}
          <StatusBadge status={result.status} />
        </div>
      </div>
      {result.problems.length > 0 && (
        <ul className={cn('mt-1 space-y-0.5 text-[11px]',
          result.status === 'fail' ? 'text-red-600' : 'text-amber-700')}>
          {result.problems.map((p, i) => <li key={i}>• {p}</li>)}
        </ul>
      )}
    </div>
  )
}

function SummaryStat({ label, value, color = 'gray' }: { label: string; value: string | number; color?: 'gray' | 'green' | 'amber' | 'red' }) {
  return (
    <div className={cn('rounded-lg px-3 py-2.5 text-center',
      color === 'green' ? 'bg-green-50' : color === 'amber' ? 'bg-amber-50' : color === 'red' ? 'bg-red-50' : 'bg-gray-50')}>
      <p className={cn('text-[10px]', color === 'green' ? 'text-green-500' : color === 'amber' ? 'text-amber-500' : color === 'red' ? 'text-red-500' : 'text-gray-400')}>{label}</p>
      <p className={cn('text-sm font-semibold mt-0.5', color === 'green' ? 'text-green-700' : color === 'amber' ? 'text-amber-700' : color === 'red' ? 'text-red-700' : 'text-gray-800')}>{value}</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { open: boolean; onClose: () => void }

export function OligoValidator({ open, onClose }: Props) {
  const refRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)

  const [refText, setRefText] = useState<string | null>(null)
  const [refLabel, setRefLabel] = useState<string | null>(null)
  const [csvText, setCsvText] = useState<string | null>(null)
  const [csvLabel, setCsvLabel] = useState<string | null>(null)
  const [manualCdsStart, setManualCdsStart] = useState<string>('')
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassed, setShowPassed] = useState(false)

  useEffect(() => {
    if (!refText || !csvText) { setResult(null); return }
    setLoading(true)
    setError(null)
    const parsed = manualCdsStart.trim() ? parseInt(manualCdsStart) - 1 : undefined  // convert 1-based UI to 0-based
    const t = setTimeout(() => {
      try {
        setResult(runValidation(refText, csvText, parsed !== undefined && !isNaN(parsed) ? parsed : undefined))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Validation failed')
        setResult(null)
      } finally {
        setLoading(false)
      }
    }, 16)
    return () => clearTimeout(t)
  }, [refText, csvText, manualCdsStart])

  async function loadRef(file: File) {
    const text = await file.text()
    const parsed = parseFasta(text)
    if (!parsed) { setError('Not a valid FASTA file (no > header line)'); return }
    setError(null)
    setRefLabel(parsed.header)
    setRefText(text)
  }

  async function loadCsv(file: File) {
    setError(null)
    setCsvLabel(file.name)
    setCsvText(await file.text())
  }

  const counts = result ? {
    pass: result.results.filter(r => r.status === 'pass').length,
    warn: result.results.filter(r => r.status === 'warn').length,
    fail: result.results.filter(r => r.status === 'fail').length,
    frameshifts: result.results.filter(r => r.isFrameshift).length,
    noAlign: result.results.filter(r => r.cdsAlignPos === null).length,
  } : null

  const issues = result?.results.filter(r => r.status !== 'pass') ?? []
  const passed = result?.results.filter(r => r.status === 'pass') ?? []

  const cdsMethodLabel = result
    ? result.cdsStartMethod === 'voted'
      ? `Auto-detected from ${result.cdsStartVotes} oligo ID${result.cdsStartVotes !== 1 ? 's' : ''}`
      : result.cdsStartMethod === 'manual'
        ? 'Manual'
        : 'Longest ORF (verify!)'
    : null

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />}
      <div className={cn(
        'fixed right-0 top-0 h-full w-[680px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Oligo validator</h2>
            <p className="text-xs text-gray-400 mt-0.5">Validate oligos against reference CDS — catch position shifts, frameshifts, wrong codons</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FileZone label="Reference FASTA" accept=".fasta,.fa,.fna,.txt" loaded={refLabel} onFile={loadRef} inputRef={refRef} />
            <FileZone label="Oligo CSV (id,sequence)" accept=".csv,.txt" loaded={csvLabel} onFile={loadCsv} inputRef={csvRef} />
          </div>

          {/* Manual CDS start override */}
          <div className="flex items-center gap-2 text-xs">
            <label className="text-gray-500 whitespace-nowrap">CDS start (nt, 1-based):</label>
            <input
              type="number"
              min={1}
              value={manualCdsStart}
              onChange={(e) => setManualCdsStart(e.target.value)}
              placeholder="Auto-detect from oligo IDs"
              className="w-48 border border-gray-200 rounded px-2 py-1 text-xs font-mono text-gray-700 placeholder-gray-300"
            />
            {manualCdsStart && (
              <button type="button" onClick={() => setManualCdsStart('')} className="text-gray-400 hover:text-gray-600">✕</button>
            )}
          </div>

          {/* Reference info panel */}
          {result && (
            <div className="text-xs bg-gray-50 rounded-lg px-3 py-2.5 space-y-0.5">
              <div className="flex items-center justify-between">
                <p className="font-mono font-medium text-gray-700">{result.refName}</p>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium',
                  result.cdsStartMethod === 'voted' ? 'bg-green-100 text-green-700' :
                  result.cdsStartMethod === 'manual' ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                )}>
                  {cdsMethodLabel}
                </span>
              </div>
              <p className="text-gray-400">
                CDS start: nt {result.cdsStartInRef + 1} · WT protein: {result.wtProtein.length} aa
              </p>
              <p className="font-mono text-[10px] text-gray-400 tracking-wider truncate">
                {result.wtProtein.slice(0, 50)}{result.wtProtein.length > 50 ? '…' : ''}
              </p>
              {result.cdsStartMethod === 'longest-orf-fallback' && (
                <p className="text-amber-600 text-[10px]">
                  ⚠ No DMS oligo IDs found for auto-detection — CDS start may be wrong. Specify manually above.
                </p>
              )}
            </div>
          )}

          {loading && <p className="text-sm text-gray-400 text-center py-6">Analysing oligos…</p>}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-lg p-3 text-sm">
              <XCircle size={15} className="mt-0.5 shrink-0" />{error}
            </div>
          )}

          {result && counts && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                <SummaryStat label="Total" value={result.totalOligos.toLocaleString()} />
                <SummaryStat label="Pass" value={counts.pass.toLocaleString()} color="green" />
                <SummaryStat label="Warn" value={counts.warn.toLocaleString()} color="amber" />
                <SummaryStat label="Fail" value={counts.fail.toLocaleString()} color="red" />
              </div>

              {counts.frameshifts > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} className="shrink-0" />
                  {counts.frameshifts.toLocaleString()} frameshift{counts.frameshifts !== 1 ? 's' : ''} detected
                </div>
              )}
              {counts.noAlign > 0 && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <XCircle size={13} className="shrink-0" />
                  {counts.noAlign.toLocaleString()} oligo{counts.noAlign !== 1 ? 's' : ''} with no CDS alignment
                </div>
              )}

              <button type="button" onClick={() => downloadReport(result)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                <Download size={12} />Download full report CSV
              </button>

              {issues.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Issues ({issues.length.toLocaleString()})</p>
                  <div className="space-y-1.5">{issues.map(r => <OligoRow key={r.id} result={r} />)}</div>
                </section>
              )}

              {counts.pass > 0 && (
                <section>
                  <button type="button" onClick={() => setShowPassed(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    {showPassed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {counts.pass.toLocaleString()} passed — {showPassed ? 'hide' : 'show'}
                  </button>
                  {showPassed && (
                    <div className="mt-2 space-y-1.5 max-h-96 overflow-y-auto">
                      {passed.map(r => <OligoRow key={r.id} result={r} />)}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
