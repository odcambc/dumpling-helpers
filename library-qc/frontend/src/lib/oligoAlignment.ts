/**
 * Sequence-based oligo validation.
 *
 * Aligns an oligo against the reference CDS using k-mer voting + a banded
 * Needleman-Wunsch with affine gap penalty, walks the alignment columns to
 * collect raw nucleotide-level diffs, then classifies each diff in the CDS
 * reading frame.
 *
 * The output is *purely descriptive* — it reports what the sequence shows,
 * not what the oligo ID claims. Claim-vs-detected reconciliation lives in
 * `detectVariant`'s caller.
 */

// ─── Genetic code ─────────────────────────────────────────────────────────────

export const CODON_TABLE: Record<string, string> = {
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

// ─── Claim parsers (reused from the old validator) ────────────────────────────

/** Substitution claim like `Gene_Ser2Cys` parsed from the oligo ID. */
export interface ClaimedMutation {
  wt: string   // 1-letter AA
  pos: number  // 1-based amino acid position
  mut: string  // 1-letter AA
}

/** Indel claim parsed from IDs like `Gene_delete-N_L-P` / `Gene_ins-N_SEQ-P`. */
export interface ClaimedIndel {
  type: 'deletion' | 'insertion'
  /** Raw numeric length from the ID — unit-ambiguous (could be nt or codons). */
  claimedLength: number
  pos: number  // 1-based AA position
  /** Literal inserted bases when the naming convention encodes the sequence. */
  insertedSeq?: string
}

export function parseClaimedMutation(id: string): ClaimedMutation | null {
  const match = id.match(/_([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})$/)
  if (!match) return null
  const wt = THREE_TO_ONE[match[1]]
  const mut = THREE_TO_ONE[match[3]]
  if (!wt || !mut) return null
  return { wt, pos: parseInt(match[2], 10), mut }
}

export function parseClaimedIndel(id: string): ClaimedIndel | null {
  // Format 1 (deletions + numeric insertions): _delete-N_L-P or _ins-N_L-P
  const numMatch = id.match(/_(delete|del|ins|insert)-\d+_(\d+)-(\d+)$/i)
  if (numMatch) {
    const type = /^(ins|insert)$/i.test(numMatch[1]) ? 'insertion' : 'deletion'
    return { type, claimedLength: parseInt(numMatch[2], 10), pos: parseInt(numMatch[3], 10) }
  }
  // Format 2 (sequence-encoded insertions): _insert-N_ACGT...-P
  const seqMatch = id.match(/_(insert|ins)-\d+_([ACGTacgt]+)-(\d+)$/i)
  if (seqMatch) {
    const insertedSeq = seqMatch[2].toUpperCase()
    return { type: 'insertion', claimedLength: insertedSeq.length, pos: parseInt(seqMatch[3], 10), insertedSeq }
  }
  return null
}

// ─── K-mer voting ─────────────────────────────────────────────────────────────

const KMER_SIZE = 15

export function buildKmerIndex(cdsUpper: string): Map<string, number[]> {
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
 * Find where the oligo aligns in the CDS using k-mer voting.
 *
 * Returns:
 * - `pos`: most-voted 0-based CDS position corresponding to oligo[0]
 *   (may be virtual / negative when a 5' adapter precedes the CDS-homologous region)
 * - `oligoCdsStart`: first oligo position where ANY CDS k-mer matched —
 *   end of the 5' adapter
 * - `oligoCdsEnd`: last such position + KMER_SIZE — start of the 3' adapter
 * - `confidence`: fraction of matching k-mers that agreed on `pos`
 *
 * Adapter trimming uses *all* k-mer hits, not just hits that agreed on the
 * winning `pos`. This matters for indel-bearing oligos: k-mers on the two
 * sides of an indel vote for different `pos` values (offset by the indel
 * length), and we need to keep BOTH regions in the bare oligo so the
 * downstream aligner can resolve the indel.
 */
export function findOligoAlignPos(
  oligoUpper: string,
  kmerIndex: Map<string, number[]>,
): { pos: number; confidence: number; oligoCdsStart: number; oligoCdsEnd: number } | null {
  const votes = new Map<number, number>()
  let totalKmers = 0
  let firstAnyMatch = -1
  let lastAnyMatch = -1

  for (let i = 0; i + KMER_SIZE <= oligoUpper.length; i++) {
    const kmer = oligoUpper.slice(i, i + KMER_SIZE)
    const cdsPositions = kmerIndex.get(kmer)
    if (!cdsPositions) continue
    if (firstAnyMatch < 0) firstAnyMatch = i
    lastAnyMatch = i
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

  return {
    pos: bestPos,
    confidence: totalKmers > 0 ? bestVotes / totalKmers : 0,
    oligoCdsStart: firstAnyMatch < 0 ? 0 : firstAnyMatch,
    oligoCdsEnd: lastAnyMatch < 0 ? oligoUpper.length : Math.min(oligoUpper.length, lastAnyMatch + KMER_SIZE),
  }
}

// ─── Banded affine-gap pairwise alignment ─────────────────────────────────────

export interface AlignOpts {
  /** Match score (positive). */
  match?: number
  /** Mismatch penalty (positive — subtracted from score). */
  mismatch?: number
  /** Gap-open penalty (positive — applied once per run of gaps). */
  gapOpen?: number
  /** Gap-extend penalty (positive — applied for each gap, including the first). */
  gapExtend?: number
  /** Half-width of the diagonal band (in cells). 0 means full DP. */
  band?: number
  /**
   * If true, gaps at the start/end of the reference (overhang of the ref
   * relative to the query) are free. This implements semi-global / glocal
   * alignment so that the reference can be padded without penalty.
   */
  freeRefEnds?: boolean
  /**
   * If true, gaps at the start/end of the query (5'/3' adapter sequence) are
   * free. Combined with freeRefEnds this gives a local-style alignment that
   * finds the best aligning sub-region of both sequences.
   */
  freeQueryEnds?: boolean
}

export interface Alignment {
  /** Aligned query string with `-` for insertions in the reference. */
  queryAln: string
  /** Aligned reference string with `-` for insertions in the query. */
  refAln: string
  score: number
  /**
   * 0-based start of the reference range consumed by the alignment.
   * Always 0 unless `freeRefEnds` allowed leading ref to be skipped.
   */
  refStart: number
  /**
   * 0-based end (exclusive) of the reference range consumed by the alignment.
   * Always `refLen` unless `freeRefEnds` allowed trailing ref to be skipped.
   */
  refEnd: number
}

/**
 * Banded Needleman-Wunsch (global) alignment with affine gap penalty.
 * The query is aligned end-to-end against the reference.
 *
 * Implementation note: the band confines DP to cells where
 * `|j - (i * (refLen / queryLen))| <= band`, anchored at the diagonal that
 * runs from (0,0) to (queryLen, refLen). With `band = 12` and a tight k-mer
 * vote, this is more than enough headroom for the indels we expect.
 */
export function alignSequences(query: string, ref: string, opts: AlignOpts = {}): Alignment {
  const match = opts.match ?? 2
  const mismatch = opts.mismatch ?? 3
  const gapOpen = opts.gapOpen ?? 5
  const gapExtend = opts.gapExtend ?? 1
  const band = opts.band ?? 12
  const freeRefEnds = opts.freeRefEnds ?? false
  const freeQueryEnds = opts.freeQueryEnds ?? false

  const Q = query.length
  const R = ref.length

  // Edge cases: one side empty → full insertions/deletions
  if (Q === 0) {
    return {
      queryAln: '-'.repeat(R), refAln: ref,
      score: -(R > 0 ? gapOpen + gapExtend * R : 0),
      refStart: 0, refEnd: R,
    }
  }
  if (R === 0) {
    return {
      queryAln: query, refAln: '-'.repeat(Q),
      score: -(Q > 0 ? gapOpen + gapExtend * Q : 0),
      refStart: 0, refEnd: 0,
    }
  }

  const NEG = Number.NEGATIVE_INFINITY
  // Three matrices: M (match/mismatch), Ix (gap in ref / insertion in query),
  // Iy (gap in query / deletion in query). We keep two rows at a time.
  // To support traceback we store traceback codes for each cell across all rows.
  // M traceback: 0=diag(M), 1=diag(Ix), 2=diag(Iy)
  // Ix traceback: 0=open(M), 1=extend(Ix)
  // Iy traceback: 0=open(M), 1=extend(Iy)
  const tbM = new Uint8Array((Q + 1) * (R + 1))
  const tbX = new Uint8Array((Q + 1) * (R + 1))
  const tbY = new Uint8Array((Q + 1) * (R + 1))

  // Per-row arrays
  const prevM = new Float64Array(R + 1)
  const prevX = new Float64Array(R + 1)
  const prevY = new Float64Array(R + 1)
  const currM = new Float64Array(R + 1)
  const currX = new Float64Array(R + 1)
  const currY = new Float64Array(R + 1)

  // Initialise row 0
  prevM[0] = 0
  // freeQueryEnds: leading query chars (= leading query gaps in ref) are
  // free. Set Ix[0][0] = 0 so freeQueryEnds chains can start at i=0 too.
  prevX[0] = freeQueryEnds ? 0 : NEG
  prevY[0] = NEG
  for (let j = 1; j <= R; j++) {
    prevM[j] = NEG
    prevX[j] = NEG
    // freeRefEnds: leading gaps in the query (= ref overhang at start) are free.
    // Otherwise we charge an affine gap penalty.
    prevY[j] = freeRefEnds ? 0 : -gapOpen - gapExtend * j
  }

  // Track best score in column R across all rows (for freeQueryEnds traceback).
  let colRBestScore = NEG
  let colRBestRow = -1
  let colRBestMat = 0  // 0=M, 1=X, 2=Y

  // When BOTH free-end flags are on, the optimal exit point can be anywhere
  // in the matrix (Smith-Waterman-like). Track the global best M-cell.
  let globalBestScore = NEG
  let globalBestRow = -1
  let globalBestCol = -1
  let globalBestMat = 0

  // Diagonal slope for banding. Without freeRefEnds we expect corner-to-corner
  // alignment (slope = R/Q). With freeRefEnds the matched ref length is
  // approximately Q (modulo small indels), so slope ≈ 1 and the band centres
  // on j = i. Using the wrong slope under freeRefEnds will push the true
  // alignment outside the band when |R - Q| is non-trivial.
  const slope = freeRefEnds ? 1 : R / Q

  // Effective band. When free ends are enabled the entry/exit point of the
  // alignment is unknown a priori, so the path can deviate from j = slope*i
  // by up to the length-difference plus the requested local band. Widen
  // accordingly so the optimum stays in-band.
  const effBand = freeRefEnds || freeQueryEnds
    ? band + Math.max(R - Q, Q - R, 0) + 16
    : band

  for (let i = 1; i <= Q; i++) {
    // Initialise column 0 of row i. Under freeQueryEnds, leading gaps in
    // the reference (= leading query characters not matched) are free.
    currM[0] = NEG
    currX[0] = freeQueryEnds ? 0 : -gapOpen - gapExtend * i
    currY[0] = NEG

    // Banded range: j around slope*i
    const center = Math.round(slope * i)
    const jStart = effBand > 0 ? Math.max(1, center - effBand) : 1
    const jEnd = effBand > 0 ? Math.min(R, center + effBand) : R

    // Clear cells outside the band on this row so they read as NEG
    for (let j = 1; j < jStart; j++) {
      currM[j] = NEG
      currX[j] = NEG
      currY[j] = NEG
    }
    for (let j = jEnd + 1; j <= R; j++) {
      currM[j] = NEG
      currX[j] = NEG
      currY[j] = NEG
    }

    const qch = query.charCodeAt(i - 1)

    for (let j = jStart; j <= jEnd; j++) {
      const rch = ref.charCodeAt(j - 1)
      const s = qch === rch ? match : -mismatch

      // M[i][j] = max(prevM[j-1], prevX[j-1], prevY[j-1]) + s
      const mDiag = prevM[j - 1] + s
      const xDiag = prevX[j - 1] + s
      const yDiag = prevY[j - 1] + s
      let bestM = mDiag, mFrom = 0
      if (xDiag > bestM) { bestM = xDiag; mFrom = 1 }
      if (yDiag > bestM) { bestM = yDiag; mFrom = 2 }
      currM[j] = bestM
      tbM[i * (R + 1) + j] = mFrom

      // Ix[i][j] = max(prevM[j] - gapOpen - gapExtend, prevX[j] - gapExtend)
      const xOpen = prevM[j] - gapOpen - gapExtend
      const xExt  = prevX[j] - gapExtend
      let bestX: number
      let xFrom: number
      if (xOpen >= xExt) { bestX = xOpen; xFrom = 0 } else { bestX = xExt; xFrom = 1 }
      currX[j] = bestX
      tbX[i * (R + 1) + j] = xFrom

      // Iy[i][j] = max(currM[j-1] - gapOpen - gapExtend, currY[j-1] - gapExtend)
      const yOpen = currM[j - 1] - gapOpen - gapExtend
      const yExt  = currY[j - 1] - gapExtend
      let bestY: number
      let yFrom: number
      if (yOpen >= yExt) { bestY = yOpen; yFrom = 0 } else { bestY = yExt; yFrom = 1 }
      currY[j] = bestY
      tbY[i * (R + 1) + j] = yFrom
    }

    // Snapshot column R for freeQueryEnds traceback (best score across rows).
    if (freeQueryEnds && jEnd >= R) {
      if (currM[R] > colRBestScore) { colRBestScore = currM[R]; colRBestRow = i; colRBestMat = 0 }
      if (currX[R] > colRBestScore) { colRBestScore = currX[R]; colRBestRow = i; colRBestMat = 1 }
      if (currY[R] > colRBestScore) { colRBestScore = currY[R]; colRBestRow = i; colRBestMat = 2 }
    }

    // Track global best M cell (for freeRefEnds + freeQueryEnds traceback).
    if (freeRefEnds && freeQueryEnds) {
      for (let jj = jStart; jj <= jEnd; jj++) {
        if (currM[jj] > globalBestScore) {
          globalBestScore = currM[jj]
          globalBestRow = i
          globalBestCol = jj
          globalBestMat = 0
        }
      }
    }

    // Roll rows
    prevM.set(currM)
    prevX.set(currX)
    prevY.set(currY)
  }

  // Traceback start. Default: from (Q, R) in the best matrix.
  // freeRefEnds: scan the entire last row (i=Q) for the best j*.
  // freeQueryEnds: scan the entire last column (j=R) for the best i*.
  // Both: scan all border cells (last row + last column).
  // Cells beyond i*/j* are unmatched overhang and contribute no diffs.
  let i = Q, j = R
  let curMat = 0  // 0=M, 1=X, 2=Y
  let bestScore = prevM[R]
  if (prevX[R] > bestScore) { bestScore = prevX[R]; curMat = 1 }
  if (prevY[R] > bestScore) { bestScore = prevY[R]; curMat = 2 }

  if (freeRefEnds || freeQueryEnds) {
    let bestI = Q, bestJ = R, bestMat = curMat, bestS = bestScore
    if (freeRefEnds) {
      // Last-row scan (any j with i = Q via prevM/prevX/prevY arrays).
      for (let jj = 0; jj <= R; jj++) {
        if (prevM[jj] > bestS) { bestS = prevM[jj]; bestI = Q; bestJ = jj; bestMat = 0 }
        if (prevX[jj] > bestS) { bestS = prevX[jj]; bestI = Q; bestJ = jj; bestMat = 1 }
        if (prevY[jj] > bestS) { bestS = prevY[jj]; bestI = Q; bestJ = jj; bestMat = 2 }
      }
    }
    if (freeQueryEnds && colRBestRow >= 0) {
      if (colRBestScore > bestS) {
        bestS = colRBestScore
        bestI = colRBestRow
        bestJ = R
        bestMat = colRBestMat
      }
    }
    // Both free: optimal exit can be at any interior cell (Smith-Waterman-like).
    if (freeRefEnds && freeQueryEnds && globalBestRow >= 0) {
      if (globalBestScore > bestS) {
        bestS = globalBestScore
        bestI = globalBestRow
        bestJ = globalBestCol
        bestMat = globalBestMat
      }
    }
    i = bestI
    j = bestJ
    curMat = bestMat
    bestScore = bestS
  }

  const refEndConsumed = j
  let refStartConsumed = 0  // updated when traceback breaks at i=0 under freeRefEnds
  const qOut: string[] = []
  const rOut: string[] = []

  while (i > 0 || j > 0) {
    // Under freeRefEnds, hitting i=0 means we've exhausted the query — any
    // remaining ref to the left is free overhang.
    if (freeRefEnds && i === 0) { refStartConsumed = j; break }
    // Under freeQueryEnds, hitting j=0 means we've exhausted the ref — any
    // remaining query to the left is free adapter / overhang.
    if (freeQueryEnds && j === 0) break
    if (curMat === 0) {
      // Came from a diagonal
      qOut.push(query[i - 1])
      rOut.push(ref[j - 1])
      const from = tbM[i * (R + 1) + j]
      i--; j--
      curMat = from  // 0=M, 1=X, 2=Y
    } else if (curMat === 1) {
      // Gap in reference (insertion in query): consumes query char, no ref char
      qOut.push(query[i - 1])
      rOut.push('-')
      const from = tbX[i * (R + 1) + j]
      i--
      curMat = from === 0 ? 0 : 1
    } else {
      // Gap in query (deletion vs ref): consumes ref char, no query char
      qOut.push('-')
      rOut.push(ref[j - 1])
      const from = tbY[i * (R + 1) + j]
      j--
      curMat = from === 0 ? 0 : 2
    }

    // Safety: if we fell into the NEG region (outside the band) and got stuck,
    // walk along the remaining axis with single-step gaps. (Don't emit those
    // gaps as overhang under freeRefEnds/freeQueryEnds — drop them instead.)
    if (i > 0 && j === 0 && curMat !== 1) {
      if (freeQueryEnds) break
      while (i > 0) { qOut.push(query[i - 1]); rOut.push('-'); i-- }
      break
    }
    if (j > 0 && i === 0 && curMat !== 2) {
      if (freeRefEnds) { refStartConsumed = j; break }
      while (j > 0) { qOut.push('-'); rOut.push(ref[j - 1]); j-- }
      break
    }
  }

  return {
    queryAln: qOut.reverse().join(''),
    refAln: rOut.reverse().join(''),
    score: bestScore,
    refStart: refStartConsumed,
    refEnd: refEndConsumed,
  }
}

// ─── Diff extraction ──────────────────────────────────────────────────────────

export type RawDiff =
  | { type: 'sub'; cdsPos: number; refNt: string; altNt: string }
  | { type: 'del'; cdsPos: number; refNt: string }   // refNt is the deleted base(s)
  | { type: 'ins'; cdsPos: number; altNt: string }   // altNt is the inserted base(s)

/**
 * Walk an alignment and emit raw nucleotide-level diffs.
 *
 * `cdsOffset` is the 0-based CDS position corresponding to `refAln[0]` —
 * i.e. where in the full CDS the alignment starts. Substitution positions
 * are `cdsOffset + (count of non-`-` ref chars before this column)`.
 *
 * Consecutive insertions / deletions are merged into a single multi-base diff
 * so that a 3-nt deletion appears as ONE diff with `refNt.length === 3`,
 * not three 1-nt diffs.
 */
export function diffsFromAlignment(aln: Alignment, cdsOffset: number): RawDiff[] {
  const diffs: RawDiff[] = []
  let refIdx = cdsOffset
  let i = 0
  const n = aln.queryAln.length
  while (i < n) {
    const q = aln.queryAln[i]
    const r = aln.refAln[i]
    if (q === r) {
      refIdx++
      i++
      continue
    }
    if (q !== '-' && r !== '-') {
      // Substitution
      diffs.push({ type: 'sub', cdsPos: refIdx, refNt: r, altNt: q })
      refIdx++
      i++
      continue
    }
    if (q === '-') {
      // Run of deletions vs reference (gap in query)
      const start = refIdx
      const bases: string[] = []
      while (i < n && aln.queryAln[i] === '-' && aln.refAln[i] !== '-') {
        bases.push(aln.refAln[i])
        refIdx++
        i++
      }
      diffs.push({ type: 'del', cdsPos: start, refNt: bases.join('') })
      continue
    }
    // r === '-': run of insertions in query relative to reference
    const start = refIdx
    const bases: string[] = []
    while (i < n && aln.refAln[i] === '-' && aln.queryAln[i] !== '-') {
      bases.push(aln.queryAln[i])
      i++
    }
    diffs.push({ type: 'ins', cdsPos: start, altNt: bases.join('') })
  }
  return diffs
}

// ─── Diff classification ──────────────────────────────────────────────────────

export type SubKind = 'synonymous' | 'missense' | 'nonsense'

export interface ClassifiedSub {
  type: 'sub'
  cdsPos: number
  /** 1-based AA position the substitution falls in. */
  aaPos: number
  refNt: string
  altNt: string
  refCodon: string
  altCodon: string
  refAa: string
  altAa: string
  kind: SubKind
}

export interface ClassifiedIndel {
  type: 'del' | 'ins'
  cdsPos: number
  /** 1-based AA position where the indel starts. */
  aaPos: number
  /** Length in nucleotides. */
  lengthNt: number
  /** Length in codons (lengthNt / 3) when in-frame; 0 when frameshift. */
  lengthCodons: number
  inFrame: boolean
  /** Bases removed (deletions) or added (insertions). */
  bases: string
}

export type ClassifiedDiff = ClassifiedSub | ClassifiedIndel

/**
 * Classify each raw diff in the CDS reading frame.
 *
 * For substitutions, the codon containing the diff is reconstructed from the
 * reference (the alt codon swaps in the alt nt at the right position) so the
 * caller doesn't need access to the alignment context.
 */
export function classifyDiffs(diffs: RawDiff[], cdsUpper: string): ClassifiedDiff[] {
  const out: ClassifiedDiff[] = []

  for (const d of diffs) {
    if (d.type === 'sub') {
      const aaPos = Math.floor(d.cdsPos / 3) + 1
      const codonStart = Math.floor(d.cdsPos / 3) * 3
      const refCodon = cdsUpper.slice(codonStart, codonStart + 3)
      const offset = d.cdsPos - codonStart
      const altCodon = refCodon.length === 3
        ? refCodon.slice(0, offset) + d.altNt + refCodon.slice(offset + 1)
        : refCodon
      const refAa = CODON_TABLE[refCodon] ?? '?'
      const altAa = CODON_TABLE[altCodon] ?? '?'
      const kind: SubKind =
        altAa === '*' ? 'nonsense'
        : refAa === altAa ? 'synonymous'
        : 'missense'
      out.push({
        type: 'sub',
        cdsPos: d.cdsPos,
        aaPos,
        refNt: d.refNt,
        altNt: d.altNt,
        refCodon,
        altCodon,
        refAa,
        altAa,
        kind,
      })
    } else if (d.type === 'del') {
      const lengthNt = d.refNt.length
      const inFrame = lengthNt % 3 === 0
      out.push({
        type: 'del',
        cdsPos: d.cdsPos,
        aaPos: Math.floor(d.cdsPos / 3) + 1,
        lengthNt,
        lengthCodons: inFrame ? lengthNt / 3 : 0,
        inFrame,
        bases: d.refNt,
      })
    } else {
      const lengthNt = d.altNt.length
      const inFrame = lengthNt % 3 === 0
      out.push({
        type: 'ins',
        cdsPos: d.cdsPos,
        aaPos: Math.floor(d.cdsPos / 3) + 1,
        lengthNt,
        lengthCodons: inFrame ? lengthNt / 3 : 0,
        inFrame,
        bases: d.altNt,
      })
    }
  }

  return out
}

// ─── Top-level: detect variant in an oligo ────────────────────────────────────

export type VariantStatus =
  | 'pass'             // detected variant matches the ID claim
  | 'pass_unclaimed'   // variant detected, no parseable claim to compare
  | 'warn_mismatch'    // detected differs from claimed
  | 'warn_no_change'   // no sequence change vs CDS (likely synthesis failure)
  | 'fail_alignment'   // cannot place oligo reliably in CDS

export interface DetectedVariant {
  status: VariantStatus
  /** 0-based CDS position corresponding to oligo[0] (may be virtual / negative). */
  cdsAlignPos: number | null
  /** Confidence of the k-mer vote (0–1). */
  alignConfidence: number
  /** The k-mer-anchored region of the oligo that was aligned. */
  oligoCdsStart: number | null
  oligoCdsEnd: number | null
  /** Classified diffs detected in the CDS-overlapping region. */
  diffs: ClassifiedDiff[]
  /** ID-parsed claim, when parseable. */
  claimedSub: ClaimedMutation | null
  claimedIndel: ClaimedIndel | null
  /** Human-readable message lines, primarily for the warn/fail statuses. */
  problems: string[]
  /**
   * BsaI / BsmBI recognition sites introduced by the oligo (not present in
   * the CDS at the same position). Informational only — does not affect
   * `status`. Empty when no new sites were found or when alignment failed.
   */
  typeIISSites: TypeIISSite[]
}

/**
 * Detect the actual variant encoded by an oligo, by aligning to the CDS and
 * walking the alignment.
 *
 * Algorithm:
 *   1. K-mer vote → candidate CDS window
 *   2. Strip 5'/3' adapter regions (anchored by k-mer matches)
 *   3. Banded affine-gap alignment of the bare oligo against
 *      `CDS[window ± padding]`
 *   4. Walk alignment columns → RawDiff[]
 *   5. Classify each diff in the reading frame
 *   6. Compare against ID claim (best-effort) to set the final status
 */
export function detectVariant(
  oligo: { id: string; sequence: string },
  cdsUpper: string,
  kmerIndex?: Map<string, number[]>,
): DetectedVariant {
  const upper = oligo.sequence.replace(/\s/g, '').toUpperCase()
  const claimedSub = parseClaimedMutation(oligo.id)
  const claimedIndel = claimedSub ? null : parseClaimedIndel(oligo.id)

  const idx = kmerIndex ?? buildKmerIndex(cdsUpper)
  const align = findOligoAlignPos(upper, idx)

  if (!align) {
    return {
      status: 'fail_alignment',
      cdsAlignPos: null,
      alignConfidence: 0,
      oligoCdsStart: null,
      oligoCdsEnd: null,
      diffs: [],
      claimedSub,
      claimedIndel,
      problems: ['No k-mer matches found in CDS — verify the correct reference file was loaded'],
      typeIISSites: [],
    }
  }

  const { pos: cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd } = align

  // Pad the "bare" oligo on both sides so that mutations sitting at the
  // k-mer-anchored boundary are still inside the alignment window. K-mer
  // voting only sees k-mers that don't *span* a mutation, so a mutation
  // within KMER_SIZE-1 bases of either end of the CDS-homologous region
  // would otherwise be clipped off as "adapter". Padding by KMER_SIZE-1
  // re-incorporates that strip.
  //
  // We don't pad further: anything more than KMER_SIZE-1 nt away from the
  // nearest matching k-mer is reliably adapter / non-CDS, and pulling it
  // in would feed garbage to the aligner.
  const QUERY_PAD = KMER_SIZE - 1
  const bareStart = Math.max(0, oligoCdsStart - QUERY_PAD)
  const bareEnd = Math.min(upper.length, oligoCdsEnd + QUERY_PAD)
  const bare = upper.slice(bareStart, bareEnd)
  if (bare.length === 0) {
    return {
      status: 'fail_alignment',
      cdsAlignPos,
      alignConfidence: confidence,
      oligoCdsStart,
      oligoCdsEnd,
      diffs: [],
      claimedSub,
      claimedIndel,
      problems: ['Oligo does not overlap with CDS region'],
      typeIISSites: [],
    }
  }

  // Reference window for alignment: extend by a generous padding to give the
  // aligner room around the homology boundary, then clip to CDS bounds.
  //
  // Padding has to absorb (a) ordinary slop and (b) the offset error that
  // arises when k-mer hits straddle an indel: k-mers on each side of an
  // indel vote for `pos` values offset by the indel length, and the winning
  // `cdsAlignPos` only matches *one* side. With padding ≥ the largest
  // expected indel (~30 nt), the alignment window still covers both sides.
  const REF_PAD = 32
  const refStart = Math.max(0, cdsAlignPos + bareStart - REF_PAD)
  const refEnd = Math.min(cdsUpper.length, cdsAlignPos + bareEnd + REF_PAD)
  const refWindow = cdsUpper.slice(refStart, refEnd)

  if (refWindow.length === 0) {
    return {
      status: 'fail_alignment',
      cdsAlignPos,
      alignConfidence: confidence,
      oligoCdsStart,
      oligoCdsEnd,
      diffs: [],
      claimedSub,
      claimedIndel,
      problems: ['Oligo does not overlap with CDS region'],
      typeIISSites: [],
    }
  }

  // Banded affine-gap alignment with free end gaps on both sides. The
  // bare oligo is padded by KMER_SIZE-1 on each side beyond the k-mer
  // anchor; freeQueryEnds lets the aligner clip excess adapter from
  // those padded regions when there's no actual mutation there. Inside
  // the matching middle, mutations are still aligned and reported.
  //
  // Scoring tuned for DMS / saturation-mutagenesis libraries:
  //   - codon-swap subs (e.g. CAT→ATG) must beat fake del+ins alignments:
  //     3 subs (cost 9) < 2 single-nt indels (2 × (8+1) = 18). gapOpen=8.
  //   - real 3-nt deletions still win over 3 mismatches:
  //     gap (8+3 = 11) ≈ 3 subs (9), but the 3 shifted mismatches that
  //     would follow tip the scales heavily toward the gap.
  const aln = alignSequences(bare, refWindow, {
    match: 2,
    mismatch: 3,
    gapOpen: 8,
    gapExtend: 1,
    band: 12,
    freeRefEnds: true,
    freeQueryEnds: true,
  })

  // The alignment under freeRefEnds may consume only a sub-range of the
  // reference window; aln.refStart pinpoints where in the window the
  // consumed range starts.
  const rawDiffs = diffsFromAlignment(aln, refStart + aln.refStart)
  const diffs = classifyDiffs(rawDiffs, cdsUpper)

  // Scan for Type IIS sites in the bare oligo that aren't already present at
  // the same position in the corresponding CDS window. We use the CDS slice
  // that aln.refStart anchors to so positions line up byte-for-byte (modulo
  // indels — same-position comparison is approximate when an indel shifts
  // the oligo relative to the CDS, but it's still the right test for the
  // common DMS/saturation case).
  const cdsAlignedWindow = cdsUpper.slice(refStart + aln.refStart, refStart + aln.refEnd)
  const typeIISSites = scanTypeIISites(bare, cdsAlignedWindow)

  // ── Status decision ────────────────────────────────────────────────────────
  if (diffs.length === 0) {
    return {
      status: 'warn_no_change',
      cdsAlignPos,
      alignConfidence: confidence,
      oligoCdsStart,
      oligoCdsEnd,
      diffs,
      claimedSub,
      claimedIndel,
      problems: ['No sequence change vs CDS — likely synthesis failure or a wild-type oligo'],
      typeIISSites,
    }
  }

  // Compare detected vs claimed.
  if (claimedSub) {
    // Look for a single substitution at the claimed AA position.
    const candidate = singleSubAtPos(diffs, claimedSub.pos)
    const isSyn = claimedSub.wt === claimedSub.mut
    if (isSyn) {
      // A synonymous claim is expected to produce a synonymous nt change at the
      // claimed AA codon, with no off-target changes elsewhere.
      const others = diffs.filter(d => !(d.type === 'sub' && d.aaPos === claimedSub.pos))
      if (candidate && candidate.kind === 'synonymous' && candidate.refAa === claimedSub.wt && others.length === 0) {
        return finalize('pass', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd, [], typeIISSites)
      }
      return finalize(
        'warn_mismatch', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd,
        [`Claimed synonymous ${claimedSub.wt}${claimedSub.pos} but detected: ${describeDiffs(diffs)}`],
        typeIISSites,
      )
    }
    if (candidate && candidate.refAa === claimedSub.wt && candidate.altAa === claimedSub.mut) {
      // Verify no other off-target diffs (anything not in the claimed codon).
      const others = diffs.filter(d => !(d.type === 'sub' && d.aaPos === claimedSub.pos))
      if (others.length === 0) {
        return finalize('pass', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd, [], typeIISSites)
      }
      return finalize(
        'warn_mismatch', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd,
        [`Claimed ${claimedSub.wt}${claimedSub.pos}${claimedSub.mut} matched, but extra changes also detected: ${describeDiffs(others)}`],
        typeIISSites,
      )
    }
    return finalize(
      'warn_mismatch', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd,
      [`Claimed ${claimedSub.wt}${claimedSub.pos}${claimedSub.mut}, detected: ${describeDiffs(diffs)}`],
      typeIISSites,
    )
  }

  if (claimedIndel) {
    const ofRightKind = diffs.filter((d): d is ClassifiedIndel =>
      (claimedIndel.type === 'deletion' && d.type === 'del') ||
      (claimedIndel.type === 'insertion' && d.type === 'ins'),
    )
    if (ofRightKind.length === 0) {
      return finalize(
        'warn_mismatch', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd,
        [`Claimed ${claimedIndel.type} at ${claimedIndel.pos}, detected: ${describeDiffs(diffs)}`],
        typeIISSites,
      )
    }
    // The claim's pos is in AA. Try to find an indel at or near that AA.
    const claimedAa = claimedIndel.pos
    const match = ofRightKind.find(d => Math.abs(d.aaPos - claimedAa) <= 1)
    if (!match) {
      return finalize(
        'warn_mismatch', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd,
        [`Claimed ${claimedIndel.type} at AA ${claimedAa}, but indel detected at AA ${ofRightKind[0].aaPos} (${describeDiffs(ofRightKind)})`],
        typeIISSites,
      )
    }
    // For sequence-encoded insertions, also check the inserted bases.
    if (claimedIndel.type === 'insertion' && claimedIndel.insertedSeq && match.bases !== claimedIndel.insertedSeq) {
      return finalize(
        'warn_mismatch', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd,
        [`Claimed insertion of ${claimedIndel.insertedSeq}, detected ${match.bases}`],
        typeIISSites,
      )
    }
    // Off-target diffs?
    const others = diffs.filter(d => d !== match)
    if (others.length > 0) {
      return finalize(
        'warn_mismatch', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd,
        [`Claimed indel matched, but extra changes also detected: ${describeDiffs(others)}`],
        typeIISSites,
      )
    }
    return finalize('pass', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd, [], typeIISSites)
  }

  // No parseable claim, but we did detect changes.
  return finalize(
    'pass_unclaimed', diffs, claimedSub, claimedIndel, cdsAlignPos, confidence, oligoCdsStart, oligoCdsEnd, [],
    typeIISSites,
  )
}

function finalize(
  status: VariantStatus,
  diffs: ClassifiedDiff[],
  claimedSub: ClaimedMutation | null,
  claimedIndel: ClaimedIndel | null,
  cdsAlignPos: number,
  alignConfidence: number,
  oligoCdsStart: number,
  oligoCdsEnd: number,
  problems: string[],
  typeIISSites: TypeIISSite[],
): DetectedVariant {
  return {
    status,
    cdsAlignPos,
    alignConfidence,
    oligoCdsStart,
    oligoCdsEnd,
    diffs,
    claimedSub,
    claimedIndel,
    problems,
    typeIISSites,
  }
}

/**
 * Find the AA-level substitution at the given AA position.
 *
 * If multiple nt-level subs all fall within the same codon, they describe a
 * single AA-level change. We synthesise that combined sub by applying every
 * sub to the reference codon and re-translating.
 */
function singleSubAtPos(diffs: ClassifiedDiff[], aaPos: number): ClassifiedSub | null {
  const subs = diffs.filter((d): d is ClassifiedSub => d.type === 'sub' && d.aaPos === aaPos)
  if (subs.length === 0) return null
  if (subs.length === 1) return subs[0]
  // Apply every sub to the ref codon to compute the true alt codon.
  const codonStart = (aaPos - 1) * 3
  const refCodon = subs[0].refCodon
  const altChars = refCodon.split('')
  for (const s of subs) altChars[s.cdsPos - codonStart] = s.altNt
  const altCodon = altChars.join('')
  const refAa = subs[0].refAa
  const altAa = CODON_TABLE[altCodon] ?? '?'
  const kind: SubKind =
    altAa === '*' ? 'nonsense'
    : refAa === altAa ? 'synonymous'
    : 'missense'
  return {
    type: 'sub',
    cdsPos: subs[0].cdsPos,
    aaPos,
    refNt: refCodon,
    altNt: altCodon,
    refCodon,
    altCodon,
    refAa,
    altAa,
    kind,
  }
}

/** Produce a compact, human-readable description of a list of diffs. */
export function describeDiff(d: ClassifiedDiff): string {
  if (d.type === 'sub') {
    return `${d.refAa}${d.aaPos}${d.altAa} (${d.refNt}>${d.altNt})`
  }
  if (d.type === 'del') {
    if (d.inFrame) {
      const codonStr = `${d.lengthCodons} codon${d.lengthCodons !== 1 ? 's' : ''}`
      return `${d.lengthNt} nt deleted (${codonStr}, in-frame) at AA ${d.aaPos}`
    }
    return `${d.lengthNt} nt deleted (frameshift) at AA ${d.aaPos}`
  }
  // ins
  if (d.inFrame) {
    const codonStr = `${d.lengthCodons} codon${d.lengthCodons !== 1 ? 's' : ''}`
    return `${d.lengthNt} nt inserted (${codonStr}, in-frame) at AA ${d.aaPos}`
  }
  return `${d.lengthNt} nt inserted (frameshift) at AA ${d.aaPos}`
}

export function describeDiffs(diffs: ClassifiedDiff[]): string {
  if (diffs.length === 0) return 'no change'
  return diffs.map(describeDiff).join('; ')
}

// ─── Type IIS recognition-site scan ───────────────────────────────────────────
//
// Golden Gate cloning relies on Type IIS enzymes that cut *outside* their
// recognition sequence. A new BsaI / BsmBI site introduced by an oligo —
// even if otherwise silent at the protein level — can cause unintended cuts
// during library assembly. We scan both strands of the bare oligo for the
// 6-nt recognition sequences, then drop any site that is also present at
// the *same position* in the corresponding CDS window: those sites are
// genomic, not introduced by the oligo.

export interface TypeIISSite {
  enzyme: 'BsaI' | 'BsmBI'
  strand: '+' | '-'
  /** 0-based position in the bare oligo where the 6-nt site begins. */
  position: number
  /** The 6-nt recognition sequence as it appears on the + strand of the oligo. */
  sequence: string
  /**
   * True when the same 6-nt recognition sequence is present at the same
   * 0-based position in `cdsWindow`. Such sites are not introduced by the
   * oligo and are not reported (filtered out before return).
   */
  inCds: boolean
}

/** Forward + reverse-complement recognition sequences for the enzymes in use. */
const TYPE_IIS_PATTERNS: { enzyme: 'BsaI' | 'BsmBI'; strand: '+' | '-'; pattern: string }[] = [
  { enzyme: 'BsaI', strand: '+', pattern: 'GGTCTC' },
  { enzyme: 'BsaI', strand: '-', pattern: 'GAGACC' },
  { enzyme: 'BsmBI', strand: '+', pattern: 'CGTCTC' },
  { enzyme: 'BsmBI', strand: '-', pattern: 'GAGACG' },
]

/**
 * Scan the bare oligo for Type IIS recognition sites (BsaI, BsmBI, both
 * strands) that are NOT already present at the same 0-based position in
 * `cdsWindow`.
 *
 * Both inputs should be uppercase, gap-free DNA strings of the *same* aligned
 * region — typically the adapter-trimmed bare oligo and the matching CDS
 * window taken from the alignment. Same-position comparison is the cheap and
 * useful test: if the oligo and the CDS share the recognition sequence at the
 * same offset, the site was inherited from the genome and the oligo did not
 * introduce it. New sites (a 6-mer that the CDS does not have at that offset)
 * are returned for downstream flagging.
 *
 * Sites in the CDS at offsets where the oligo doesn't carry one are simply
 * absent from the output — we only report what the oligo has.
 */
export function scanTypeIISites(bareOligo: string, cdsWindow: string): TypeIISSite[] {
  const sites: TypeIISSite[] = []
  const oligo = bareOligo.toUpperCase()
  const cds = cdsWindow.toUpperCase()
  for (const { enzyme, strand, pattern } of TYPE_IIS_PATTERNS) {
    let i = 0
    while ((i = oligo.indexOf(pattern, i)) !== -1) {
      // Same-position check: does the CDS window also have this exact 6-mer
      // starting at offset `i`? If so, the site is genomic, not introduced.
      const cdsSlice = cds.slice(i, i + pattern.length)
      const inCds = cdsSlice === pattern
      if (!inCds) {
        sites.push({ enzyme, strand, position: i, sequence: pattern, inCds: false })
      }
      i++
    }
  }
  // Sort by position for stable display.
  sites.sort((a, b) => a.position - b.position)
  return sites
}
