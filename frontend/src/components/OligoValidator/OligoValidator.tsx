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

// Three-letter to one-letter amino acid codes (including stop synonyms)
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

type OligoStatus = 'pass' | 'warn' | 'fail'

interface ActualDiff {
  pos: number
  wtAa: string
  mutAa: string
}

/**
 * Parsed from IDs like `Gene_delete-N_L-P`:
 *   N = library chunk, L = deletion length in bp (3/6/9), P = 1-based AA start position.
 * Insertion IDs follow the same convention with `insert` or `ins`.
 */
interface ClaimedIndel {
  type: 'deletion' | 'insertion'
  lengthNt: number   // 3, 6, or 9
  pos: number        // 1-based start position in the protein
}

interface OligoResult {
  id: string
  status: OligoStatus
  claimed: ClaimedMutation | null
  claimedIndel: ClaimedIndel | null
  actual: ActualDiff[]
  /** Specific codon used at the claimed position — for nucleotide-level inspection */
  actualCodon: string | null
  isFrameshift: boolean
  cdsFound: boolean
  problems: string[]
}

interface ValidationResult {
  refName: string
  /** Full WT protein translated from the reference's longest ORF */
  wtProtein: string
  /** 0-based nt position where the longest ORF starts in the reference */
  cdsStartInRef: number
  totalOligos: number
  results: OligoResult[]
}

// ─── Sequence utilities ───────────────────────────────────────────────────────

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

/** Translate from `start` (0-based nt index), stopping at the first stop codon. */
function translate(seq: string, start: number): string {
  const upper = seq.toUpperCase()
  let protein = ''
  for (let i = start; i + 2 < upper.length; i += 3) {
    const aa = CODON_TABLE[upper.slice(i, i + 3)] ?? '?'
    if (aa === '*') break
    protein += aa
  }
  return protein
}

/**
 * Find the ATG that starts the longest ORF in the sequence.
 * Used on the reference — no assumptions about Kozak context or case.
 */
function findLongestOrf(seq: string): number {
  const upper = seq.toUpperCase()
  let bestStart = -1
  let bestLen = 0
  let i = 0
  while ((i = upper.indexOf('ATG', i)) >= 0) {
    let len = 0
    for (let j = i; j + 2 < upper.length; j += 3) {
      if (CODON_TABLE[upper.slice(j, j + 3)] === '*') break
      len++
    }
    if (len > bestLen) { bestLen = len; bestStart = i }
    i++
  }
  return bestStart
}

/**
 * Find the ATG in an oligo whose translation best aligns to the WT protein.
 * Scores each ATG by the number of AA differences vs WT over the shared length;
 * ties broken by longer shared length (more coverage = more confident anchor).
 * This works across species and cloning designs without assuming any Kozak context.
 */
function findOligoCdsStart(oligoSeq: string, wtProtein: string): number {
  const upper = oligoSeq.toUpperCase()
  let bestStart = -1
  let bestDiffs = Infinity
  let bestLen = 0
  let i = 0

  while ((i = upper.indexOf('ATG', i)) >= 0) {
    // Translate without stopping at stop codons so frameshifted oligos still align
    let fragment = ''
    for (let j = i; j + 2 < upper.length; j += 3) {
      fragment += CODON_TABLE[upper.slice(j, j + 3)] ?? '?'
    }
    if (fragment.length < 5) { i++; continue }

    const shared = Math.min(fragment.length, wtProtein.length)
    let diffs = 0
    for (let j = 0; j < shared; j++) {
      // Don't penalise stop codons — they may be intentional nonsense variants
      const fa = fragment[j], wa = wtProtein[j]
      if (fa !== '*' && wa !== '*' && fa !== wa) diffs++
    }

    if (diffs < bestDiffs || (diffs === bestDiffs && shared > bestLen)) {
      bestDiffs = diffs
      bestLen = shared
      bestStart = i
    }
    i++
  }
  return bestStart
}

// ─── Mutation ID parsing ──────────────────────────────────────────────────────

/**
 * Parse three-letter AA codes from oligo IDs like `Gene_Library_Asp2Cys`.
 * Returns null for deletion-scan or other non-DMS naming conventions.
 */
function parseClaimedMutation(id: string): ClaimedMutation | null {
  const match = id.match(/_([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})$/)
  if (!match) return null
  const wt = THREE_TO_ONE[match[1]]
  const mut = THREE_TO_ONE[match[3]]
  if (!wt || !mut) return null
  return { wt, pos: parseInt(match[2], 10), mut }
}

/**
 * Parse deletion/insertion IDs like `Gene_delete-N_L-P` or `Gene_ins-N_L-P`.
 * L must be 3, 6, or 9 (whole codons). P is the 1-based AA start position.
 */
function parseClaimedIndel(id: string): ClaimedIndel | null {
  const delMatch = id.match(/_(delete|del|ins|insert)-\d+_(\d+)-(\d+)$/i)
  if (!delMatch) return null
  const keyword = delMatch[1].toLowerCase()
  const type = keyword === 'ins' || keyword === 'insert' ? 'insertion' : 'deletion'
  const lengthNt = parseInt(delMatch[2], 10)
  const pos = parseInt(delMatch[3], 10)
  if (isNaN(lengthNt) || isNaN(pos)) return null
  return { type, lengthNt, pos }
}

// ─── Core validation ──────────────────────────────────────────────────────────

/**
 * @param cdsStartHint - precomputed CDS offset shared across the library; -1 to force full search.
 *   The hint is trusted only when `upper[hint..hint+2] === 'ATG'`.  All oligos in one library
 *   have the same adapter prefix so the hint is valid for ~100% of rows after the first.
 */
function validateOligo(id: string, rawSeq: string, wtProtein: string, cdsStartHint = -1): OligoResult {
  const upper = rawSeq.replace(/\s/g, '').toUpperCase()

  // Fast path: skip alignment scoring if the hint position is already an ATG
  const cdsStart =
    cdsStartHint >= 0 && upper.slice(cdsStartHint, cdsStartHint + 3) === 'ATG'
      ? cdsStartHint
      : findOligoCdsStart(upper, wtProtein)
  if (cdsStart < 0) {
    return {
      id, claimed: null, claimedIndel: null, actual: [], actualCodon: null,
      isFrameshift: false, cdsFound: false, status: 'fail',
      problems: ['No ATG found in oligo sequence'],
    }
  }

  const cdsFragment = upper.slice(cdsStart)
  const isFrameshift = cdsFragment.length % 3 !== 0
  const oligoProtein = translate(upper, cdsStart)

  const problems: string[] = []
  let status: OligoStatus = 'pass'
  function fail(msg: string) { problems.push(msg); status = 'fail' }
  function warn(msg: string) { problems.push(msg); if (status !== 'fail') status = 'warn' }

  if (isFrameshift) fail(`CDS fragment (${cdsFragment.length}nt) is not divisible by 3 — frameshift`)

  const claimed = parseClaimedMutation(id)
  const claimedIndel = claimed ? null : parseClaimedIndel(id)

  // ── DMS variant (missense / synonymous / nonsense) ───────────────────────────
  if (claimed) {
    const actual: ActualDiff[] = []
    const shared = Math.min(oligoProtein.length, wtProtein.length)
    for (let i = 0; i < shared; i++) {
      if (oligoProtein[i] !== wtProtein[i]) actual.push({ pos: i + 1, wtAa: wtProtein[i], mutAa: oligoProtein[i] })
    }

    const codonStart = cdsStart + (claimed.pos - 1) * 3
    const actualCodon = codonStart + 3 <= upper.length ? upper.slice(codonStart, codonStart + 3) : null
    const refAa = wtProtein[claimed.pos - 1]
    const oligoAa = oligoProtein[claimed.pos - 1]
    const isSyn = claimed.wt === claimed.mut

    if (refAa !== undefined && refAa !== claimed.wt) {
      fail(`Position ${claimed.pos}: reference has ${refAa}, ID claims WT is ${claimed.wt} — position shift?`)
    }

    if (oligoAa === undefined) {
      warn(`Position ${claimed.pos} is beyond the oligo's translated region`)
    } else if (isSyn) {
      if (oligoAa !== claimed.wt) {
        fail(`Position ${claimed.pos}: expected synonymous (${claimed.wt}), oligo encodes ${claimed.wt}→${oligoAa}` +
          (actualCodon ? ` (codon: ${actualCodon})` : ''))
      }
    } else {
      if (oligoAa !== claimed.mut) {
        fail(`Position ${claimed.pos}: claimed ${claimed.wt}→${claimed.mut}, oligo encodes ${claimed.wt}→${oligoAa}` +
          (actualCodon ? ` (codon: ${actualCodon})` : ''))
      }
    }

    const extra = actual.filter(d => d.pos !== claimed.pos)
    if (extra.length > 0) {
      const desc = extra.slice(0, 3).map(d => `${d.wtAa}${d.pos}${d.mutAa}`).join(', ')
      warn(`${extra.length} unexpected AA change(s): ${desc}${extra.length > 3 ? ' …' : ''}`)
    }

    return { id, claimed, claimedIndel: null, actual, actualCodon, isFrameshift, cdsFound: true, status, problems }
  }

  // ── Deletion / insertion ─────────────────────────────────────────────────────
  if (claimedIndel) {
    const { type, lengthNt, pos } = claimedIndel
    const indelCodons = lengthNt / 3

    if (lengthNt % 3 !== 0) {
      fail(`Claimed ${type} length ${lengthNt}nt is not a multiple of 3 — would cause frameshift`)
    }

    // Build a gapped diff: compare pre-indel region, then post-indel region with appropriate offset
    const actual: ActualDiff[] = []

    if (!isFrameshift && lengthNt % 3 === 0) {
      // Pre-indel region: positions 1..pos-1 should match WT exactly
      for (let i = 0; i < pos - 1 && i < oligoProtein.length && i < wtProtein.length; i++) {
        if (oligoProtein[i] !== wtProtein[i]) actual.push({ pos: i + 1, wtAa: wtProtein[i], mutAa: oligoProtein[i] })
      }

      if (type === 'deletion') {
        // Post-deletion: oligo[pos-1..] should match WT[pos-1+indelCodons..]
        const wtOffset = pos - 1 + indelCodons
        for (
          let i = pos - 1, j = wtOffset;
          i < oligoProtein.length && j < wtProtein.length;
          i++, j++
        ) {
          if (oligoProtein[i] !== wtProtein[j]) actual.push({ pos: j + 1, wtAa: wtProtein[j], mutAa: oligoProtein[i] })
        }

        // Check: oligo should be indelCodons shorter than WT over this region
        const expectedOligoLen = Math.max(0, wtProtein.length - indelCodons)
        if (oligoProtein.length > expectedOligoLen + 2) {
          warn(`Oligo protein (${oligoProtein.length} aa) is longer than expected after ${indelCodons}-codon deletion at pos ${pos}`)
        }
      } else {
        // Insertion: oligo[pos-1+indelCodons..] should match WT[pos-1..]
        for (
          let i = pos - 1 + indelCodons, j = pos - 1;
          i < oligoProtein.length && j < wtProtein.length;
          i++, j++
        ) {
          if (oligoProtein[i] !== wtProtein[j]) actual.push({ pos: j + 1, wtAa: wtProtein[j], mutAa: oligoProtein[i] })
        }
      }

      if (actual.length > 0) {
        const desc = actual.slice(0, 3).map(d => `${d.wtAa}${d.pos}${d.mutAa}`).join(', ')
        warn(`${actual.length} unexpected mismatch(es) outside ${type} site: ${desc}${actual.length > 3 ? ' …' : ''}`)
      }
    }

    return { id, claimed: null, claimedIndel, actual, actualCodon: null, isFrameshift, cdsFound: true, status, problems }
  }

  // ── Unknown ID format ────────────────────────────────────────────────────────
  const actual: ActualDiff[] = []
  const shared = Math.min(oligoProtein.length, wtProtein.length)
  for (let i = 0; i < shared; i++) {
    if (oligoProtein[i] !== wtProtein[i]) actual.push({ pos: i + 1, wtAa: wtProtein[i], mutAa: oligoProtein[i] })
  }
  if (actual.length > 0) {
    const desc = actual.slice(0, 3).map(d => `${d.wtAa}${d.pos}${d.mutAa}`).join(', ')
    warn(`Unparseable ID; ${actual.length} AA difference(s) vs WT: ${desc}`)
  }
  // Zero diffs + unparseable ID → likely a WT control → pass silently

  return { id, claimed: null, claimedIndel: null, actual, actualCodon: null, isFrameshift, cdsFound: true, status, problems }
}

function runValidation(refText: string, csvText: string): ValidationResult {
  const ref = parseFasta(refText)
  if (!ref) throw new Error('Could not parse reference — expected FASTA format (> header line)')

  const cdsStartInRef = findLongestOrf(ref.seq)
  if (cdsStartInRef < 0) throw new Error('No ATG found in reference sequence')

  const wtProtein = translate(ref.seq, cdsStartInRef)
  if (wtProtein.length < 5) throw new Error('Reference ORF translates to fewer than 5 amino acids — check that the CDS is included')

  const oligos = parseOligoCsv(csvText)
  if (oligos.length === 0) throw new Error('No oligos parsed — expected comma-separated id,sequence format with no header row')

  // Detect shared CDS offset from the first few oligos so subsequent oligos skip
  // the expensive alignment-scoring search (all oligos share the same adapter prefix).
  let sharedCdsOffset = -1
  for (const o of oligos.slice(0, 3)) {
    const upper = o.seq.replace(/\s/g, '').toUpperCase()
    const offset = findOligoCdsStart(upper, wtProtein)
    if (offset >= 0) { sharedCdsOffset = offset; break }
  }

  return {
    refName: ref.header,
    wtProtein,
    cdsStartInRef,
    totalOligos: oligos.length,
    results: oligos.map(o => validateOligo(o.id, o.seq, wtProtein, sharedCdsOffset)),
  }
}

function downloadReport(result: ValidationResult) {
  const header = ['id', 'status', 'claimed', 'actual_codon', 'actual_diffs', 'problems'].join(',')
  const rows = result.results.map(r => {
    const cells = [
      r.id,
      r.status,
      r.claimed ? `${r.claimed.wt}${r.claimed.pos}${r.claimed.mut}` : '',
      r.actualCodon ?? '',
      r.actual.map(d => `${d.wtAa}${d.pos}${d.mutAa}`).join(';'),
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function FileZone({
  label, accept, loaded, onFile, inputRef,
}: {
  label: string
  accept: string
  loaded: string | null
  onFile: (f: File) => void
  inputRef: React.RefObject<HTMLInputElement>
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
          <p className="text-[10px] text-gray-400">Drop or click to browse</p>
        </>
      )}
      <input ref={inputRef} type="file" accept={accept} className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
      />
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
      {status === 'pass'
        ? <CheckCircle size={9} />
        : status === 'warn'
          ? <AlertTriangle size={9} />
          : <XCircle size={9} />}
      {status.toUpperCase()}
    </span>
  )
}

function OligoRow({ result }: { result: OligoResult }) {
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
              {result.claimedIndel.type === 'deletion' ? 'Δ' : '+'}
              {result.claimedIndel.lengthNt / 3}aa@{result.claimedIndel.pos}
            </span>
          )}
          {result.actualCodon && result.status !== 'pass' && (
            <span className="font-mono text-[10px] text-gray-500 bg-white px-1 rounded border border-gray-200">
              {result.actualCodon}
            </span>
          )}
          <StatusBadge status={result.status} />
        </div>
      </div>
      {result.problems.length > 0 && (
        <ul className={cn(
          'mt-1 space-y-0.5 text-[11px]',
          result.status === 'fail' ? 'text-red-600' : 'text-amber-700',
        )}>
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
      <p className={cn('text-[10px]',
        color === 'green' ? 'text-green-500' : color === 'amber' ? 'text-amber-500' : color === 'red' ? 'text-red-500' : 'text-gray-400')}>
        {label}
      </p>
      <p className={cn('text-sm font-semibold mt-0.5',
        color === 'green' ? 'text-green-700' : color === 'amber' ? 'text-amber-700' : color === 'red' ? 'text-red-700' : 'text-gray-800')}>
        {value}
      </p>
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
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassed, setShowPassed] = useState(false)

  // Auto-validate whenever both files are loaded
  useEffect(() => {
    if (!refText || !csvText) { setResult(null); return }
    setLoading(true)
    setError(null)
    const t = setTimeout(() => {
      try {
        setResult(runValidation(refText, csvText))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Validation failed')
        setResult(null)
      } finally {
        setLoading(false)
      }
    }, 16)
    return () => clearTimeout(t)
  }, [refText, csvText])

  async function loadRef(file: File) {
    const text = await file.text()
    const parsed = parseFasta(text)
    if (!parsed) { setError('Not a valid FASTA file — expected a header line starting with >'); return }
    setRefLabel(parsed.header)
    setRefText(text)
  }

  async function loadCsv(file: File) {
    setCsvLabel(file.name)
    setCsvText(await file.text())
  }

  const counts = result ? {
    pass: result.results.filter(r => r.status === 'pass').length,
    warn: result.results.filter(r => r.status === 'warn').length,
    fail: result.results.filter(r => r.status === 'fail').length,
    frameshifts: result.results.filter(r => r.isFrameshift).length,
    noCds: result.results.filter(r => !r.cdsFound).length,
  } : null

  const issues = result?.results.filter(r => r.status !== 'pass') ?? []
  const passed = result?.results.filter(r => r.status === 'pass') ?? []

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />}
      <div className={cn(
        'fixed right-0 top-0 h-full w-[680px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Oligo validator</h2>
            <p className="text-xs text-gray-400 mt-0.5">Catch position shifts, frameshifts, and wrong codons against the reference ORF</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* File drop zones */}
          <div className="grid grid-cols-2 gap-3">
            <FileZone label="Reference FASTA" accept=".fasta,.fa,.fna,.txt" loaded={refLabel} onFile={loadRef} inputRef={refRef} />
            <FileZone label="Oligo CSV" accept=".csv,.txt" loaded={csvLabel} onFile={loadCsv} inputRef={csvRef} />
          </div>

          {/* Reference sanity-check panel */}
          {result && (
            <div className="text-xs bg-gray-50 rounded-lg px-3 py-2.5 space-y-0.5">
              <p className="font-medium text-gray-700 font-mono">{result.refName}</p>
              <p className="text-gray-400">
                WT protein · {result.wtProtein.length} aa · ORF starts at nt {result.cdsStartInRef + 1}
              </p>
              <p className="font-mono text-[10px] text-gray-400 tracking-wider truncate">
                {result.wtProtein.slice(0, 50)}{result.wtProtein.length > 50 ? '…' : ''}
              </p>
            </div>
          )}

          {loading && (
            <p className="text-sm text-gray-400 text-center py-6">Analysing oligos…</p>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-lg p-3 text-sm">
              <XCircle size={15} className="mt-0.5 shrink-0" />{error}
            </div>
          )}

          {result && counts && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="grid grid-cols-4 gap-2">
                <SummaryStat label="Total" value={result.totalOligos.toLocaleString()} />
                <SummaryStat label="Pass" value={counts.pass.toLocaleString()} color="green" />
                <SummaryStat label="Warn" value={counts.warn.toLocaleString()} color="amber" />
                <SummaryStat label="Fail" value={counts.fail.toLocaleString()} color="red" />
              </div>

              {/* Supplementary flags */}
              {counts.frameshifts > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} className="shrink-0" />
                  {counts.frameshifts.toLocaleString()} frameshift{counts.frameshifts !== 1 ? 's' : ''} (CDS fragment length not divisible by 3)
                </div>
              )}
              {counts.noCds > 0 && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <XCircle size={13} className="shrink-0" />
                  {counts.noCds.toLocaleString()} oligo{counts.noCds !== 1 ? 's' : ''} with no ATG found
                </div>
              )}

              {/* Download report */}
              <button
                type="button"
                onClick={() => downloadReport(result)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Download size={12} />
                Download full report CSV
              </button>

              {/* Issues */}
              {issues.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Issues ({issues.length.toLocaleString()})
                  </p>
                  <div className="space-y-1.5">
                    {issues.map(r => <OligoRow key={r.id} result={r} />)}
                  </div>
                </section>
              )}

              {/* Passed (collapsible — may be thousands of rows) */}
              {counts.pass > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setShowPassed(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
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
