import { useRef, useState, useEffect } from 'react'
import { Upload, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download } from 'lucide-react'
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

type OligoStatus = 'pass' | 'warn' | 'fail'

// ─── Grid constants ───────────────────────────────────────────────────────────

const WINDOW_SIZE = 20
const AA_ORDER = ['F', 'W', 'Y', 'C', 'H', 'K', 'R', 'D', 'E', 'N', 'Q', 'S', 'T', 'G', 'A', 'V', 'I', 'L', 'M', 'P']
const AA_COLOR: Record<string, string> = {
  F: '#B45309', W: '#92400E', Y: '#D97706', C: '#065F46',
  H: '#1D4ED8', K: '#2563EB', R: '#1E40AF',
  D: '#B91C1C', E: '#DC2626',
  N: '#059669', Q: '#10B981', S: '#34D399', T: '#6EE7B7',
  G: '#6B7280', A: '#9CA3AF', V: '#B45309', I: '#92400E', L: '#78350F', M: '#A16207', P: '#D97706',
}
const AA_BG: Record<string, string> = {
  F: '#FEF3C7', W: '#FDE68A', Y: '#FEF9C3', C: '#D1FAE5',
  H: '#DBEAFE', K: '#BFDBFE', R: '#93C5FD',
  D: '#FEE2E2', E: '#FECACA',
  N: '#D1FAE5', Q: '#A7F3D0', S: '#ECFDF5', T: '#D1FAE5',
  G: '#F3F4F6', A: '#F9FAFB', V: '#FFFBEB', I: '#FEF3C7', L: '#FEF3C7', M: '#FEF9C3', P: '#FFFBEB',
}
const STATUS_BG: Record<OligoStatus, string> = { pass: '#86EFAC', warn: '#FDE68A', fail: '#FCA5A5' }
const STATUS_BORDER: Record<OligoStatus, string> = { pass: '#22C55E', warn: '#F59E0B', fail: '#EF4444' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface OligoEntry { id: string; seq: string }

interface ClaimedMutation {
  wt: string   // 1-letter AA
  pos: number  // 1-based amino acid position
  mut: string  // 1-letter AA
}

/**
 * Parsed from indel IDs like `Gene_delete-N_L-P` / `Gene_ins-N_SEQ-P`.
 *
 * For deletions: `claimedLength` is the raw number from the ID (unit ambiguous —
 * could be nt or codons). The actual length is always determined by alignment.
 *
 * For insertions: `insertedSeq` contains the literal inserted bases from the ID
 * when the naming convention encodes the sequence (e.g. `_GGC-2`). When only a
 * number is given, `claimedLength` is set and `insertedSeq` is undefined.
 */
interface ClaimedIndel {
  type: 'deletion' | 'insertion'
  /** Raw numeric length from the ID (deletions, or insertions named by count) */
  claimedLength: number
  pos: number
  /** Literal inserted bases from the ID, when the naming convention uses a sequence */
  insertedSeq?: string
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

/** Per-position summary built from all oligos that target a given AA position. */
interface OligoPositionData {
  wtAa: string
  /** mut AA → { pass, warn, fail } counts across all oligos claiming that substitution */
  mutations: Map<string, { pass: number; warn: number; fail: number }>
  /**
   * Indel counts split by type and actual codon count.
   * Key format: `"del:N"` | `"ins:N"` where N = codon count from alignment.
   */
  indelsByType: Map<string, { pass: number; warn: number; fail: number }>
  oligoCount: number
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
  positionMap: Map<number, OligoPositionData>
  sortedPositions: number[]
  posMin: number
  posMax: number
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
  // Format 1 (deletions + numeric insertions): _delete-N_L-P or _ins-N_L-P
  const numMatch = id.match(/_(delete|del|ins|insert)-\d+_(\d+)-(\d+)$/i)
  if (numMatch) {
    const type = /^(ins|insert)$/i.test(numMatch[1]) ? 'insertion' : 'deletion'
    return { type, claimedLength: parseInt(numMatch[2], 10), pos: parseInt(numMatch[3], 10) }
  }
  // Format 2 (sequence-encoded insertions): _insert-N_ACGT...-P
  // The inserted sequence itself is encoded in the ID, e.g. _insert-1_GGC-2
  const seqMatch = id.match(/_(insert|ins)-\d+_([ACGTacgt]+)-(\d+)$/i)
  if (seqMatch) {
    const insertedSeq = seqMatch[2].toUpperCase()
    return { type: 'insertion', claimedLength: insertedSeq.length, pos: parseInt(seqMatch[3], 10), insertedSeq }
  }
  return null
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
 * alignment start position. Adapter k-mers generate no votes naturally.
 *
 * Returns:
 * - `pos`: the most-voted 0-based CDS position corresponding to oligo[0] (may be a
 *   virtual/extrapolated position when a 5' adapter precedes the CDS-homologous region)
 * - `oligoCdsStart`: first oligo position where a CDS k-mer was found — marks the end
 *   of the 5' adapter
 * - `oligoCdsEnd`: last such position + KMER_SIZE — marks the start of the 3' adapter
 * - `confidence`: fraction of matching k-mers that agreed on `pos`
 */
function findOligoAlignPos(
  oligoUpper: string,
  kmerIndex: Map<string, number[]>,
): { pos: number; confidence: number; oligoCdsStart: number; oligoCdsEnd: number } | null {
  const votes = new Map<number, number>()
  const firstMatchForPos = new Map<number, number>()
  const lastMatchForPos = new Map<number, number>()
  let totalKmers = 0

  for (let i = 0; i + KMER_SIZE <= oligoUpper.length; i++) {
    const kmer = oligoUpper.slice(i, i + KMER_SIZE)
    const cdsPositions = kmerIndex.get(kmer)
    if (!cdsPositions) continue
    for (const cdsPos of cdsPositions) {
      const candidateStart = cdsPos - i
      votes.set(candidateStart, (votes.get(candidateStart) ?? 0) + 1)
      if (!firstMatchForPos.has(candidateStart)) firstMatchForPos.set(candidateStart, i)
      lastMatchForPos.set(candidateStart, i)
    }
    totalKmers++
  }

  if (votes.size === 0) return null

  let bestPos = 0, bestVotes = 0
  for (const [pos, count] of votes) {
    if (count > bestVotes) { bestVotes = count; bestPos = pos }
  }

  const firstMatch = firstMatchForPos.get(bestPos) ?? 0
  const lastMatch = lastMatchForPos.get(bestPos) ?? (oligoUpper.length - KMER_SIZE)

  return {
    pos: bestPos,
    confidence: totalKmers > 0 ? bestVotes / totalKmers : 0,
    oligoCdsStart: firstMatch,
    oligoCdsEnd: Math.min(oligoUpper.length, lastMatch + KMER_SIZE),
  }
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

  const { pos: cdsAlignPos, oligoCdsStart, oligoCdsEnd } = alignment

  // ── DMS substitution oligos ───────────────────────────────────────────────
  // Validated entirely by direct codon lookup; gapless alignment is NOT used.
  //
  // Gapless alignment is unreliable for tiling libraries: each oligo has 5'/3'
  // adapter sequences whose length we can only estimate from k-mer positions, and
  // that estimate breaks down when the mutation is near the adapter-CDS boundary.
  // The direct codon check avoids this: it uses cdsAlignPos (robustly determined
  // by k-mer voting across the whole oligo) plus the full oligo sequence, so it
  // works correctly regardless of adapter length or mutation position.
  if (claimed) {
    const claimedCdsNtStart = (claimed.pos - 1) * 3
    const oligoCodonStart   = claimedCdsNtStart - cdsAlignPos

    if (oligoCodonStart < 0 || oligoCodonStart + 3 > upper.length) {
      warn(`Claimed position ${claimed.pos} (CDS nt ${claimedCdsNtStart + 1}–${claimedCdsNtStart + 3}) is outside the oligo's CDS overlap`)
      return { id, claimed, claimedIndel: null, cdsAlignPos, changes: [], isFrameshift: false, problems, status }
    }

    const oligoCodon = upper.slice(oligoCodonStart, oligoCodonStart + 3)
    const refCodon   = cdsUpper.slice(claimedCdsNtStart, claimedCdsNtStart + 3)
    const oligoAa    = CODON_TABLE[oligoCodon] ?? '?'
    const refAa      = CODON_TABLE[refCodon] ?? '?'
    const isSyn      = claimed.wt === claimed.mut

    if (refAa !== claimed.wt) {
      fail(`Position ${claimed.pos}: reference has ${refAa}, ID claims WT is ${claimed.wt} — position shift or wrong reference?`)
    } else if (isSyn) {
      if (oligoAa !== claimed.wt) {
        fail(`Position ${claimed.pos}: claimed synonymous (${claimed.wt}→${claimed.wt}), oligo encodes ${oligoAa} (codon: ${oligoCodon})`)
      }
    } else {
      if (oligoCodon === refCodon) {
        fail(`Position ${claimed.pos}: claimed ${claimed.wt}→${claimed.mut} but oligo matches reference — no mutation at this position`)
      } else if (oligoAa !== claimed.mut) {
        fail(`Position ${claimed.pos}: claimed ${claimed.wt}→${claimed.mut}, oligo encodes ${claimed.wt}→${oligoAa} (codon: ${oligoCodon})`)
      }
    }

    const change: ActualChange = {
      cdsNtPos: claimedCdsNtStart,
      aaPos: claimed.pos,
      isCodonAligned: true,
      isFrameshift: false,
      type: 'sub',
      refBases: refCodon,
      oligoBases: oligoCodon,
      wtAa: refAa,
      mutAa: oligoAa,
    }

    return { id, claimed, claimedIndel: null, cdsAlignPos, changes: [change], isFrameshift: false, problems, status }
  }

  // ── Claimed indel: alignment-driven length discovery + verification ──────
  // We do NOT trust the length in the ID — naming conventions vary (codons vs.
  // nucleotides) and design errors do occur. Instead:
  //   1. Search for the pre-indel CDS flank directly in the oligo sequence.
  //      This locates the indel site without needing to know L.
  //   2. Scan candidate lengths (3, 6, 9 … 30 nt) and check the post-flank
  //      at each offset. The first match is the actual indel length.
  //   3. Cross-check the actual length against the claimed value (treating
  //      the claimed number as codons, per common naming conventions) and
  //      warn if they differ.
  if (claimedIndel) {
    const { type: indelType, claimedLength, pos } = claimedIndel
    const D = (pos - 1) * 3  // 0-based CDS nt start of the indel

    const FLANK = 8
    const preFlankSeq = cdsUpper.slice(Math.max(0, D - FLANK), D)

    if (preFlankSeq.length < 3) {
      fail(`${indelType} at position ${pos} is too close to the start of the CDS to verify via flanking sequence`)
      return { id, claimed: null, claimedIndel, cdsAlignPos, changes: [], isFrameshift: false, problems, status }
    }

    // Collect all positions in the oligo where the pre-indel CDS flank ends.
    // Adapter sequences won't match CDS-specific flanks, so false hits are rare.
    const candidateSites: number[] = []
    for (let i = 0; i + preFlankSeq.length <= upper.length; i++) {
      if (upper.slice(i, i + preFlankSeq.length) === preFlankSeq) {
        candidateSites.push(i + preFlankSeq.length)
      }
    }

    if (candidateSites.length === 0) {
      fail(`Could not locate pre-${indelType} CDS flank in the oligo — check reference file or oligo ID`)
      return { id, claimed: null, claimedIndel, cdsAlignPos, changes: [], isFrameshift: false, problems, status }
    }

    // For each candidate site, determine the actual indel length.
    let indelSiteInOligo = -1
    let actualLengthNt = -1

    // Fast path for insertions where the sequence is encoded in the ID:
    // we know exactly what to look for — no scanning needed.
    if (indelType === 'insertion' && claimedIndel.insertedSeq) {
      const knownSeq = claimedIndel.insertedSeq
      const postFlank = D + FLANK <= cdsUpper.length ? cdsUpper.slice(D, D + FLANK) : null
      for (const site of candidateSites) {
        if (actualLengthNt >= 0) break
        const L = knownSeq.length
        if (site + L + FLANK > upper.length) continue
        const seqMatches = upper.slice(site, site + L) === knownSeq
        const flankMatches = postFlank ? upper.slice(site + L, site + L + FLANK) === postFlank : true
        if (seqMatches && flankMatches) {
          indelSiteInOligo = site; actualLengthNt = L
        } else if (!seqMatches && flankMatches) {
          // Post-flank matches but wrong bases — the insertion IS here but the sequence differs
          warn(`Insertion at position ${pos}: expected ${knownSeq} from ID but found ${upper.slice(site, site + L)} in oligo`)
          indelSiteInOligo = site; actualLengthNt = L
        }
      }
    } else {
      for (const site of candidateSites) {
        if (actualLengthNt >= 0) break
        if (indelType === 'deletion') {
          for (let L = 3; L <= 30 && actualLengthNt < 0; L += 3) {
            if (D + L + FLANK > cdsUpper.length) break
            if (upper.slice(site, site + FLANK) === cdsUpper.slice(D + L, D + L + FLANK)) {
              indelSiteInOligo = site; actualLengthNt = L
            }
          }
        } else {
          if (D + FLANK > cdsUpper.length) break
          const postFlank = cdsUpper.slice(D, D + FLANK)
          for (let L = 3; L <= 30 && actualLengthNt < 0; L += 3) {
            if (site + L + FLANK > upper.length) break
            if (upper.slice(site + L, site + L + FLANK) === postFlank) {
              indelSiteInOligo = site; actualLengthNt = L
            }
          }
        }
      }
    }

    if (actualLengthNt < 0) {
      // Secondary scan: look for non-codon-boundary indels (frameshifts).
      // This gives a precise "frameshift of N nt" message instead of a generic failure.
      let frameshiftLengthNt = -1
      let frameshiftSite = -1

      for (const site of candidateSites) {
        if (frameshiftLengthNt >= 0) break
        if (indelType === 'deletion') {
          for (let L = 1; L <= 15 && frameshiftLengthNt < 0; L++) {
            if (L % 3 === 0) continue  // already checked in primary scan
            if (D + L + FLANK > cdsUpper.length) break
            if (upper.slice(site, site + FLANK) === cdsUpper.slice(D + L, D + L + FLANK)) {
              frameshiftSite = site; frameshiftLengthNt = L
            }
          }
        } else {
          if (D + FLANK > cdsUpper.length) break
          const postFlank = cdsUpper.slice(D, D + FLANK)
          for (let L = 1; L <= 15 && frameshiftLengthNt < 0; L++) {
            if (L % 3 === 0) continue
            if (site + L + FLANK > upper.length) break
            if (upper.slice(site + L, site + L + FLANK) === postFlank) {
              frameshiftSite = site; frameshiftLengthNt = L
            }
          }
        }
      }

      if (frameshiftLengthNt >= 0) {
        fail(`Frameshift ${indelType} of ${frameshiftLengthNt} nt at position ${pos} — not a multiple of 3, causes a reading frame shift`)
        const refBases = indelType === 'deletion' ? cdsUpper.slice(D, D + frameshiftLengthNt) : ''
        const oligoBases = indelType === 'insertion' ? upper.slice(frameshiftSite, frameshiftSite + frameshiftLengthNt) : ''
        const fsChange: ActualChange = {
          cdsNtPos: D, aaPos: pos,
          isCodonAligned: D % 3 === 0, isFrameshift: true,
          type: indelType === 'deletion' ? 'del' : 'ins',
          refBases, oligoBases, wtAa: null, mutAa: null,
        }
        return { id, claimed: null, claimedIndel, cdsAlignPos, changes: [fsChange], isFrameshift: true, problems, status }
      }

      fail(`Could not determine ${indelType} length at position ${pos} — no ${indelType} found matching the reference flanks (tried 1–30 nt)`)
      return { id, claimed: null, claimedIndel, cdsAlignPos, changes: [], isFrameshift: false, problems, status }
    }

    // Cross-check claimed vs actual.
    // Skip for insertions where the sequence was encoded in the ID — we already
    // verified (or warned about) the actual bases above.
    if (!(indelType === 'insertion' && claimedIndel.insertedSeq)) {
      const actualCodons = actualLengthNt / 3
      if (claimedLength !== actualCodons && claimedLength !== actualLengthNt) {
        warn(`Length mismatch: ID claims ${claimedLength} (likely codons), alignment found ${actualCodons} codon${actualCodons !== 1 ? 's' : ''} (${actualLengthNt} nt)`)
      }
    }

    const refBases = indelType === 'deletion' ? cdsUpper.slice(D, D + actualLengthNt) : ''
    const oligoBases = indelType === 'insertion' ? upper.slice(indelSiteInOligo, indelSiteInOligo + actualLengthNt) : ''
    const indelChange: ActualChange = {
      cdsNtPos: D, aaPos: pos,
      isCodonAligned: D % 3 === 0, isFrameshift: false,
      type: indelType === 'deletion' ? 'del' : 'ins',
      refBases, oligoBases, wtAa: null, mutAa: null,
    }
    return { id, claimed: null, claimedIndel, cdsAlignPos, changes: [indelChange], isFrameshift: false, problems, status }
  }

  // ── Unknown oligos: gapless alignment ─────────────────────────────────────
  // For oligos we can't parse, try to characterise the mutation via gapless
  // alignment. This won't catch indels (equal-length regions), but it will
  // identify substitutions and produce a meaningful warning message.
  const rawCdsStart    = cdsAlignPos + oligoCdsStart
  const rawCdsEnd      = cdsAlignPos + oligoCdsEnd
  const cdsRegionStart = Math.max(0, rawCdsStart)
  const cdsRegionEnd   = Math.min(cdsUpper.length, rawCdsEnd)
  const oligoRegionStart = oligoCdsStart + (cdsRegionStart - rawCdsStart)
  const oligoRegionEnd   = oligoCdsEnd   - (rawCdsEnd - cdsRegionEnd)

  const cdsRegion   = cdsUpper.slice(cdsRegionStart, cdsRegionEnd)
  const oligoRegion = upper.slice(oligoRegionStart, oligoRegionEnd)

  if (cdsRegion.length === 0) {
    fail('Oligo does not overlap with CDS region')
    return { id, claimed: null, claimedIndel: null, cdsAlignPos, changes: [], isFrameshift: false, problems, status }
  }

  const { prefixLen, refMid, oligoMid } = gaplessAlign(cdsRegion, oligoRegion)

  if (refMid.length === 0 && oligoMid.length === 0) {
    return { id, claimed: null, claimedIndel: null, cdsAlignPos, changes: [], isFrameshift: false, problems, status }
  }

  const mutCdsNtPos = cdsRegionStart + prefixLen
  const change      = classifyChange(mutCdsNtPos, refMid, oligoMid, cdsUpper)

  if (change.isFrameshift) {
    fail(`Frameshift at CDS nt ${mutCdsNtPos + 1}: ${refMid.length}nt→${oligoMid.length}nt (diff ${Math.abs(refMid.length - oligoMid.length)}nt, not divisible by 3)`)
  }
  if (change.type !== 'sub' && !change.isCodonAligned) {
    warn(`Indel starts at CDS nt ${mutCdsNtPos + 1} (frame +${mutCdsNtPos % 3}) — not at a codon boundary`)
  }
  if (change.wtAa && change.mutAa) {
    warn(`Unparseable ID; found ${change.type} ${change.wtAa}${change.aaPos}${change.mutAa} at CDS nt ${mutCdsNtPos + 1}`)
  } else {
    warn(`Unparseable ID; found ${change.type} (${refMid.length}nt→${oligoMid.length}nt) at CDS nt ${mutCdsNtPos + 1}`)
  }

  return { id, claimed: null, claimedIndel: null, cdsAlignPos, changes: [change], isFrameshift: change.isFrameshift, problems, status }
}

/**
 * Compute display status from pass/warn/fail counts.
 * >50% fail → fail; any fail or warn → warn; otherwise pass.
 * This makes the grid less alarming when only a minority of oligos for a given
 * position have issues — a single rogue oligo won't paint the whole column red.
 */
function effectiveStatus(counts: { pass: number; warn: number; fail: number }): OligoStatus {
  const total = counts.pass + counts.warn + counts.fail
  if (total === 0) return 'pass'
  if (counts.fail / total > 0.5) return 'fail'
  if (counts.fail > 0 || counts.warn > 0) return 'warn'
  return 'pass'
}

function positionEffectiveStatus(d: OligoPositionData): OligoStatus {
  let pass = 0, warn = 0, fail = 0
  for (const c of d.mutations.values()) { pass += c.pass; warn += c.warn; fail += c.fail }
  for (const c of d.indelsByType.values()) { pass += c.pass; warn += c.warn; fail += c.fail }
  return effectiveStatus({ pass, warn, fail })
}

function buildOligoPositionMap(
  results: OligoResult[],
  wtProtein: string,
): { map: Map<number, OligoPositionData>; sorted: number[] } {
  const map = new Map<number, OligoPositionData>()

  function getOrCreate(pos: number): OligoPositionData {
    if (!map.has(pos)) {
      map.set(pos, {
        wtAa: pos >= 1 && pos <= wtProtein.length ? wtProtein[pos - 1] : '?',
        mutations: new Map(),
        indelsByType: new Map(),
        oligoCount: 0,
      })
    }
    return map.get(pos)!
  }

  for (const r of results) {
    if (r.claimed) {
      const d = getOrCreate(r.claimed.pos)
      d.oligoCount++
      if (d.wtAa === '?') d.wtAa = r.claimed.wt
      if (!d.mutations.has(r.claimed.mut)) d.mutations.set(r.claimed.mut, { pass: 0, warn: 0, fail: 0 })
      d.mutations.get(r.claimed.mut)![r.status]++
    } else if (r.claimedIndel) {
      const { type: indelType, pos: indelPos } = r.claimedIndel
      const ch = r.changes[0]
      const prefix = indelType === 'deletion' ? 'del' : 'ins'
      // Derive actual size from alignment (refBases for del, oligoBases for ins).
      const actualNt = indelType === 'deletion' ? (ch?.refBases.length ?? 0) : (ch?.oligoBases.length ?? 0)
      // Key format:
      //   "del:N" / "ins:N"   — in-frame, N = codon count
      //   "del:fsN" / "ins:fsN" — frameshift, N = nt count
      //   "del:C" / "ins:C"   — unverified, C = claimedLength (treated as codons)
      let key: string
      if (r.isFrameshift && actualNt > 0) {
        key = `${prefix}:fs${actualNt}`
      } else if (actualNt > 0) {
        key = `${prefix}:${Math.floor(actualNt / 3)}`
      } else {
        key = `${prefix}:${r.claimedIndel.claimedLength}`
      }
      // Deletions erase multiple WT residues — mark every covered position.
      // Insertions and frameshifts mark only the start position.
      const span = !r.isFrameshift && indelType === 'deletion' && actualNt > 0 ? Math.floor(actualNt / 3) : 1
      for (let i = 0; i < span; i++) {
        const d = getOrCreate(indelPos + i)
        d.oligoCount++
        if (!d.indelsByType.has(key)) d.indelsByType.set(key, { pass: 0, warn: 0, fail: 0 })
        d.indelsByType.get(key)![r.status]++
      }
    } else {
      const pos = r.changes[0]?.aaPos ?? null
      if (pos !== null) getOrCreate(pos).oligoCount++
    }
  }

  const sorted = [...map.keys()].sort((a, b) => a - b)
  return { map, sorted }
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

  const results = oligos.map(o => validateOligo(o.id, o.seq, cdsSeq, kmerIndex))
  const { map: positionMap, sorted: sortedPositions } = buildOligoPositionMap(results, wtProtein)
  const posMin = sortedPositions.length > 0 ? sortedPositions[0] : 1
  const posMax = sortedPositions.length > 0 ? sortedPositions[sortedPositions.length - 1] : 1

  return {
    refName: ref.header,
    cdsStartInRef,
    cdsStartMethod,
    cdsStartVotes,
    wtProtein,
    totalOligos: oligos.length,
    positionMap,
    sortedPositions,
    posMin,
    posMax,
    results,
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
      r.claimedIndel ? `${r.claimedIndel.type}@${r.claimedIndel.pos}` : '',
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

// ─── Position overview components ─────────────────────────────────────────────

function OligoRibbon({
  sortedPositions, posMin, posMax, positionMap, windowStart, onNavigate,
}: {
  sortedPositions: number[]
  posMin: number; posMax: number
  positionMap: Map<number, OligoPositionData>
  windowStart: number
  onNavigate: (pos: number) => void
}) {
  const range = posMax - posMin + 1
  if (range <= 0 || sortedPositions.length === 0) return null

  function posColor(pos: number): string {
    const d = positionMap.get(pos)
    if (!d) return '#E5E7EB'
    const s = positionEffectiveStatus(d)
    if (s === 'fail') return '#FCA5A5'
    if (s === 'warn') return '#FDE68A'
    return '#86EFAC'
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    onNavigate(Math.round(posMin + frac * (range - 1)))
  }

  const indLeft = ((windowStart - posMin) / range) * 100
  const indWidth = (WINDOW_SIZE / range) * 100

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{posMin}</span>
        <span className="text-gray-500 font-medium">
          Validation status by position — click to navigate · {sortedPositions.length} positions covered
        </span>
        <span>{posMax}</span>
      </div>
      <div
        className="relative h-5 rounded overflow-hidden cursor-crosshair"
        style={{ background: '#E5E7EB' }}
        onClick={handleClick}
        title="Click to navigate"
      >
        <div className="absolute inset-0 flex">
          {Array.from({ length: range }, (_, i) => {
            const pos = posMin + i
            return <div key={pos} style={{ flex: 1, background: posColor(pos) }} title={`AA ${pos}`} />
          })}
        </div>
        <div
          className="absolute top-0 bottom-0 border-2 border-gray-700 rounded-sm pointer-events-none"
          style={{ left: `${Math.max(0, indLeft)}%`, width: `${Math.min(indWidth, 100 - Math.max(0, indLeft))}%` }}
        />
      </div>
      <div className="flex gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: '#86EFAC' }} />Pass</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: '#FDE68A' }} />Warn</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: '#FCA5A5' }} />Fail</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-gray-200 inline-block" />No oligos</span>
      </div>
    </div>
  )
}

function OligoGrid({
  positionMap, windowStart, posMin, posMax,
}: {
  positionMap: Map<number, OligoPositionData>
  windowStart: number
  posMin: number; posMax: number
}) {
  const windowPositions = Array.from(
    { length: WINDOW_SIZE },
    (_, i) => windowStart + i,
  ).filter(p => p >= posMin && p <= posMax)

  // Only show AA rows that appear as mutations in this window
  const aasInWindow = new Set<string>()
  const indelTypesInWindow = new Set<string>()
  for (const pos of windowPositions) {
    const d = positionMap.get(pos)
    if (!d) continue
    for (const aa of d.mutations.keys()) aasInWindow.add(aa)
    for (const key of d.indelsByType.keys()) indelTypesInWindow.add(key)
  }
  const displayAas = AA_ORDER.filter(aa => aasInWindow.has(aa))
  // Sort indel types: deletions before insertions, in-frame (codon-count) before frameshift,
  // shorter before longer within each group.
  const sortedIndelTypes = [...indelTypesInWindow].sort((a, b) => {
    const [aType, aN] = a.split(':'); const [bType, bN] = b.split(':')
    if (aType !== bType) return aType === 'del' ? -1 : 1
    const aIsFs = aN.startsWith('fs')
    const bIsFs = bN.startsWith('fs')
    if (aIsFs !== bIsFs) return aIsFs ? 1 : -1  // in-frame first, frameshift last
    const aNum = aIsFs ? parseInt(aN.slice(2)) : parseInt(aN)
    const bNum = bIsFs ? parseInt(bN.slice(2)) : parseInt(bN)
    return aNum - bNum
  })

  const CELL = 16
  const LABEL_W = 26

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: LABEL_W + windowPositions.length * (CELL + 1) }}>
        {/* Position number header */}
        <div className="flex mb-1">
          <div style={{ width: LABEL_W }} />
          {windowPositions.map(pos => (
            <div key={pos} style={{ width: CELL, marginRight: 1, fontSize: 8 }} className="text-center text-gray-400 font-mono">
              {pos}
            </div>
          ))}
        </div>

        {/* WT row */}
        <div className="flex items-center mb-1">
          <div style={{ width: LABEL_W, fontSize: 8 }} className="text-gray-400 font-semibold text-right pr-1.5">WT</div>
          {windowPositions.map(pos => {
            const d = positionMap.get(pos)
            const aa = d?.wtAa ?? '?'
            const bg = AA_BG[aa] ?? '#F3F4F6'
            const color = AA_COLOR[aa] ?? '#6B7280'
            return (
              <div key={pos} style={{ width: CELL, marginRight: 1 }} className="flex justify-center">
                {d ? (
                  <span
                    title={`${aa}${pos}`}
                    style={{
                      background: bg, color,
                      width: CELL, height: CELL, fontSize: 8,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 3, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0,
                      border: `1px solid ${bg}`,
                    }}
                  >
                    {aa}
                  </span>
                ) : (
                  <span style={{ width: CELL, height: CELL, display: 'block' }} />
                )}
              </div>
            )
          })}
        </div>

        <div className="border-t border-gray-200 mb-1" />

        {/* AA substitution rows — only AAs present in this window */}
        {displayAas.map(aa => (
          <div key={aa} className="flex items-center" style={{ marginBottom: 1 }}>
            <div
              style={{ width: LABEL_W, fontSize: 8, color: AA_COLOR[aa] ?? '#6B7280' }}
              className="font-mono font-bold text-right pr-1.5"
            >
              {aa}
            </div>
            {windowPositions.map(pos => {
              const d = positionMap.get(pos)
              const counts = d?.mutations.get(aa) ?? null
              const status = counts ? effectiveStatus(counts) : null
              return (
                <div key={pos} style={{ width: CELL, height: CELL, marginRight: 1 }} className="flex justify-center items-center">
                  {status ? (
                    <div
                      title={`${d?.wtAa ?? '?'}${pos}${aa}: ${status} (${counts!.pass}✓ ${counts!.warn}⚠ ${counts!.fail}✗)`}
                      style={{
                        width: CELL - 2, height: CELL - 2, borderRadius: 2,
                        background: STATUS_BG[status],
                        border: `1px solid ${STATUS_BORDER[status]}`,
                      }}
                    />
                  ) : d?.wtAa === aa ? (
                    <div style={{ width: CELL - 2, height: CELL - 2, borderRadius: 2, background: '#F3F4F6' }} />
                  ) : (
                    <div style={{ width: CELL - 2, height: CELL - 2, borderRadius: 2, background: '#F9FAFB' }} />
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* Indel rows — one per type+length combination present in this window */}
        {sortedIndelTypes.length > 0 && (
          <>
            <div className="border-t border-gray-200 mt-1 mb-1" />
            {sortedIndelTypes.map(key => {
              const [indelKind, nStr] = key.split(':')
              const isFs = nStr.startsWith('fs')
              const displayCount = isFs ? nStr.slice(2) : nStr
              const label = (indelKind === 'del' ? 'Δ' : '+') + displayCount + (isFs ? 'nt' : '')
              return (
                <div key={key} className="flex items-center" style={{ marginBottom: 1 }}>
                  <div style={{ width: LABEL_W, fontSize: 8, color: '#7C3AED' }} className="font-mono font-bold text-right pr-1.5">
                    {label}
                  </div>
                  {windowPositions.map(pos => {
                    const d = positionMap.get(pos)
                    const counts = d?.indelsByType.get(key) ?? null
                    const status = counts ? effectiveStatus(counts) : null
                    return (
                      <div key={pos} style={{ width: CELL, height: CELL, marginRight: 1 }} className="flex justify-center items-center">
                        {status ? (
                          <div
                            title={`${label}aa at AA ${pos}: ${status} (${counts!.pass}✓ ${counts!.warn}⚠ ${counts!.fail}✗)`}
                            style={{
                              width: CELL - 2, height: CELL - 2, borderRadius: 2,
                              background: STATUS_BG[status],
                              border: `1px solid ${STATUS_BORDER[status]}`,
                            }}
                          />
                        ) : (
                          <div style={{ width: CELL - 2, height: CELL - 2, borderRadius: 2, background: '#F9FAFB' }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
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
          {result.claimedIndel && (() => {
            const { type, pos, claimedLength, insertedSeq } = result.claimedIndel
            const ch = result.changes[0]
            const actualNt = type === 'deletion' ? (ch?.refBases.length ?? 0) : (ch?.oligoBases.length ?? 0)
            let label: string
            if (result.isFrameshift && actualNt > 0) {
              const sym = type === 'deletion' ? 'Δ' : '+'
              label = `${sym}${actualNt}nt@${pos}`
            } else if (type === 'insertion' && insertedSeq) {
              // Show abbreviated sequence for known insertions (max 6 chars shown)
              const displaySeq = insertedSeq.length > 6 ? `${insertedSeq.slice(0, 6)}…` : insertedSeq
              label = `+[${displaySeq}]@${pos}`
            } else {
              const n = actualNt > 0 ? Math.floor(actualNt / 3) : claimedLength
              label = type === 'deletion'
                ? n > 1 ? `Δ${n}aa@${pos}–${pos + n - 1}` : `Δ1aa@${pos}`
                : `+${n}aa@${pos}`
            }
            return <span className="text-gray-400 font-mono text-[10px]">{label}</span>
          })()}
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

export function OligoValidator() {
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
  const [windowStart, setWindowStart] = useState(1)

  function navigate(delta: number) {
    if (!result) return
    setWindowStart(s => Math.max(result.posMin, Math.min(result.posMax - WINDOW_SIZE + 1, s + delta)))
  }

  function navigateTo(pos: number) {
    if (!result) return
    const centered = pos - Math.floor(WINDOW_SIZE / 2)
    setWindowStart(Math.max(result.posMin, Math.min(result.posMax - WINDOW_SIZE + 1, centered)))
  }

  useEffect(() => {
    if (!refText || !csvText) { setResult(null); return }
    setLoading(true)
    setError(null)
    const parsed = manualCdsStart.trim() ? parseInt(manualCdsStart) - 1 : undefined  // convert 1-based UI to 0-based
    const t = setTimeout(() => {
      try {
        const r = runValidation(refText, csvText, parsed !== undefined && !isNaN(parsed) ? parsed : undefined)
        setResult(r)
        setWindowStart(r.posMin)
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
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Oligo validator</h2>
          <p className="text-xs text-gray-400 mt-0.5">Validate oligos against reference CDS — catch position shifts, frameshifts, wrong codons</p>
        </div>
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

              {result.sortedPositions.length > 0 && (
                <section className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Position overview</p>
                  <OligoRibbon
                    sortedPositions={result.sortedPositions}
                    posMin={result.posMin} posMax={result.posMax}
                    positionMap={result.positionMap}
                    windowStart={windowStart}
                    onNavigate={navigateTo}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(-WINDOW_SIZE)}
                      disabled={windowStart <= result.posMin}
                      className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs text-gray-500">
                      AA{' '}
                      <input
                        type="number"
                        value={windowStart}
                        min={result.posMin}
                        max={Math.max(result.posMin, result.posMax - WINDOW_SIZE + 1)}
                        onChange={(e) => navigateTo(parseInt(e.target.value) || result.posMin)}
                        className="w-16 text-center border border-gray-200 rounded px-1 py-0.5 text-xs font-mono mx-1"
                      />
                      – {Math.min(windowStart + WINDOW_SIZE - 1, result.posMax)}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(WINDOW_SIZE)}
                      disabled={windowStart + WINDOW_SIZE > result.posMax}
                      className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <OligoGrid
                    positionMap={result.positionMap}
                    windowStart={windowStart}
                    posMin={result.posMin}
                    posMax={result.posMax}
                  />
                </section>
              )}

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
  )
}
