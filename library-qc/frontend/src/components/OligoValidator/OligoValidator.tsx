import { useRef, useState, useEffect } from 'react'
import { Upload, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CODON_TABLE,
  buildKmerIndex,
  detectVariant,
  describeDiff,
  describeDiffs,
  parseClaimedMutation,
  type ClaimedMutation,
  type ClassifiedDiff,
  type ClassifiedSub,
  type ClassifiedIndel,
  type DetectedVariant,
  type TypeIISSite,
  type VariantStatus,
} from '@/lib/oligoAlignment'

// ─── Display constants ────────────────────────────────────────────────────────

/** UI bucket: pass = green, warn = amber, fail = red. */
type DisplayBucket = 'pass' | 'warn' | 'fail'

const STATUS_BUCKET: Record<VariantStatus, DisplayBucket> = {
  pass: 'pass',
  pass_unclaimed: 'pass',
  warn_mismatch: 'warn',
  warn_no_change: 'warn',
  fail_alignment: 'fail',
}

const STATUS_LABEL: Record<VariantStatus, string> = {
  pass: 'PASS',
  pass_unclaimed: 'UNCLAIMED',
  warn_mismatch: 'MISMATCH',
  warn_no_change: 'NO CHANGE',
  fail_alignment: 'NO ALIGN',
}

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
const STATUS_BG: Record<DisplayBucket, string> = { pass: '#86EFAC', warn: '#FDE68A', fail: '#FCA5A5' }
const STATUS_BORDER: Record<DisplayBucket, string> = { pass: '#22C55E', warn: '#F59E0B', fail: '#EF4444' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface OligoEntry { id: string; seq: string }

interface OligoResult {
  id: string
  detected: DetectedVariant
}

/**
 * Per-position summary built from all oligos that target a given AA position.
 *
 * For substitutions we group by detected mutant AA. For indels we group by a
 * key encoding type, length, and frame status.
 */
interface OligoPositionData {
  wtAa: string
  /** Detected mut AA → bucket counts across oligos. */
  mutations: Map<string, { pass: number; warn: number; fail: number }>
  /** Indel key (see `indelKey`) → bucket counts. */
  indelsByType: Map<string, { pass: number; warn: number; fail: number }>
  oligoCount: number
}

interface ValidationResult {
  refName: string
  cdsStartInRef: number
  cdsStartMethod: 'voted' | 'manual' | 'longest-orf-fallback'
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

function inferCdsStart(
  refUpper: string,
  oligos: OligoEntry[],
): { pos: number; votes: number } {
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

// ─── Position-map helpers ─────────────────────────────────────────────────────

/** Bucket for the grid: pass / warn / fail. */
function bucketOf(status: VariantStatus): DisplayBucket {
  return STATUS_BUCKET[status]
}

/** Compose a key for the indel-row grouping in the grid. */
function indelKey(d: ClassifiedIndel): string {
  const prefix = d.type === 'del' ? 'del' : 'ins'
  return d.inFrame ? `${prefix}:${d.lengthCodons}` : `${prefix}:fs${d.lengthNt}`
}

/**
 * Pick a single "primary" classified diff to summarise the oligo in the grid.
 * For DMS-style oligos this is overwhelmingly a single sub or single indel,
 * so picking the first non-synonymous (or first sub if all are synonymous,
 * or first indel) is typically correct.
 */
function primaryDiff(diffs: ClassifiedDiff[]): ClassifiedDiff | null {
  if (diffs.length === 0) return null
  const indel = diffs.find(d => d.type === 'del' || d.type === 'ins')
  if (indel) return indel
  // Merge nt subs in the same codon → single AA-level sub for the grid.
  const subs = diffs.filter((d): d is ClassifiedSub => d.type === 'sub')
  if (subs.length === 0) return null
  // Group by aaPos
  const byAa = new Map<number, ClassifiedSub[]>()
  for (const s of subs) {
    const arr = byAa.get(s.aaPos)
    if (arr) arr.push(s)
    else byAa.set(s.aaPos, [s])
  }
  // Prefer non-synonymous codon
  for (const arr of byAa.values()) {
    const merged = mergeCodonSubs(arr)
    if (merged.kind !== 'synonymous') return merged
  }
  // Otherwise return the first
  const first = [...byAa.values()][0]
  return mergeCodonSubs(first)
}

function mergeCodonSubs(subs: ClassifiedSub[]): ClassifiedSub {
  if (subs.length === 1) return subs[0]
  const aaPos = subs[0].aaPos
  const codonStart = (aaPos - 1) * 3
  const refCodon = subs[0].refCodon
  const altChars = refCodon.split('')
  for (const s of subs) altChars[s.cdsPos - codonStart] = s.altNt
  const altCodon = altChars.join('')
  const refAa = subs[0].refAa
  const altAa = CODON_TABLE[altCodon] ?? '?'
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
    kind: altAa === '*' ? 'nonsense' : refAa === altAa ? 'synonymous' : 'missense',
  }
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
    const bucket = bucketOf(r.detected.status)
    const primary = primaryDiff(r.detected.diffs)

    // Determine an anchor AA position for this oligo:
    //  - prefer the detected variant's AA position
    //  - fall back to the claim's position when no variant was detected
    //    (e.g. warn_no_change), so the issue still shows in the grid
    let anchorPos: number | null = null
    if (primary) {
      anchorPos = primary.aaPos
    } else if (r.detected.claimedSub) {
      anchorPos = r.detected.claimedSub.pos
    } else if (r.detected.claimedIndel) {
      anchorPos = r.detected.claimedIndel.pos
    }
    if (anchorPos === null) continue

    const d = getOrCreate(anchorPos)
    d.oligoCount++

    if (primary && primary.type === 'sub') {
      const aa = primary.altAa
      if (!d.mutations.has(aa)) d.mutations.set(aa, { pass: 0, warn: 0, fail: 0 })
      d.mutations.get(aa)![bucket]++
    } else if (primary && (primary.type === 'del' || primary.type === 'ins')) {
      const key = indelKey(primary)
      // Deletions span multiple WT residues → mark every covered position.
      const span = primary.type === 'del' && primary.inFrame && primary.lengthCodons > 0
        ? primary.lengthCodons
        : 1
      for (let i = 0; i < span; i++) {
        const dd = i === 0 ? d : getOrCreate(anchorPos + i)
        if (i > 0) dd.oligoCount++
        if (!dd.indelsByType.has(key)) dd.indelsByType.set(key, { pass: 0, warn: 0, fail: 0 })
        dd.indelsByType.get(key)![bucket]++
      }
    } else if (r.detected.claimedSub) {
      // No variant detected, but the ID claimed a substitution — mark under
      // claimed mut AA so warn_no_change shows up in context.
      const aa = r.detected.claimedSub.mut
      if (!d.mutations.has(aa)) d.mutations.set(aa, { pass: 0, warn: 0, fail: 0 })
      d.mutations.get(aa)![bucket]++
    } else if (r.detected.claimedIndel) {
      const key = `${r.detected.claimedIndel.type === 'deletion' ? 'del' : 'ins'}:${r.detected.claimedIndel.claimedLength}`
      if (!d.indelsByType.has(key)) d.indelsByType.set(key, { pass: 0, warn: 0, fail: 0 })
      d.indelsByType.get(key)![bucket]++
    }
  }

  const sorted = [...map.keys()].sort((a, b) => a - b)
  return { map, sorted }
}

/**
 * Effective bucket for a counts triple.
 * >50% fail → fail; any fail or warn → warn; otherwise pass.
 */
function effectiveBucket(counts: { pass: number; warn: number; fail: number }): DisplayBucket {
  const total = counts.pass + counts.warn + counts.fail
  if (total === 0) return 'pass'
  if (counts.fail / total > 0.5) return 'fail'
  if (counts.fail > 0 || counts.warn > 0) return 'warn'
  return 'pass'
}

function positionEffectiveBucket(d: OligoPositionData): DisplayBucket {
  let pass = 0, warn = 0, fail = 0
  for (const c of d.mutations.values()) { pass += c.pass; warn += c.warn; fail += c.fail }
  for (const c of d.indelsByType.values()) { pass += c.pass; warn += c.warn; fail += c.fail }
  return effectiveBucket({ pass, warn, fail })
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

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
      cdsStartInRef = findLongestOrf(refUpper)
      cdsStartMethod = 'longest-orf-fallback'
    }
  }

  if (cdsStartInRef < 0) throw new Error('Could not locate CDS start codon in reference — try specifying it manually')

  const cdsSeq = refUpper.slice(cdsStartInRef)
  const wtProtein = translate(cdsSeq, 0)
  if (wtProtein.length < 5) throw new Error('Reference CDS translates to fewer than 5 amino acids — check the reference file')

  const kmerIndex = buildKmerIndex(cdsSeq)

  const results: OligoResult[] = oligos.map(o => ({
    id: o.id,
    detected: detectVariant({ id: o.id, sequence: o.seq }, cdsSeq, kmerIndex),
  }))
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
  const header = ['id', 'status', 'detected', 'claimed', 'cds_align_pos', 'align_confidence', 'problems'].join(',')
  const rows = result.results.map(r => {
    const claimedStr = r.detected.claimedSub
      ? `${r.detected.claimedSub.wt}${r.detected.claimedSub.pos}${r.detected.claimedSub.mut}`
      : r.detected.claimedIndel
        ? `${r.detected.claimedIndel.type}@${r.detected.claimedIndel.pos}`
        : ''
    const cells = [
      r.id,
      r.detected.status,
      describeDiffs(r.detected.diffs),
      claimedStr,
      r.detected.cdsAlignPos ?? '',
      r.detected.alignConfidence.toFixed(2),
      r.detected.problems.join(' | '),
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
    const s = positionEffectiveBucket(d)
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

  const aasInWindow = new Set<string>()
  const indelTypesInWindow = new Set<string>()
  for (const pos of windowPositions) {
    const d = positionMap.get(pos)
    if (!d) continue
    for (const aa of d.mutations.keys()) aasInWindow.add(aa)
    for (const key of d.indelsByType.keys()) indelTypesInWindow.add(key)
  }
  const displayAas = AA_ORDER.filter(aa => aasInWindow.has(aa))
  const sortedIndelTypes = [...indelTypesInWindow].sort((a, b) => {
    const [aType, aN] = a.split(':'); const [bType, bN] = b.split(':')
    if (aType !== bType) return aType === 'del' ? -1 : 1
    const aIsFs = aN.startsWith('fs')
    const bIsFs = bN.startsWith('fs')
    if (aIsFs !== bIsFs) return aIsFs ? 1 : -1
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

        {/* AA substitution rows */}
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
              const status = counts ? effectiveBucket(counts) : null
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

        {/* Indel rows */}
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
                    const status = counts ? effectiveBucket(counts) : null
                    return (
                      <div key={pos} style={{ width: CELL, height: CELL, marginRight: 1 }} className="flex justify-center items-center">
                        {status ? (
                          <div
                            title={`${label} at AA ${pos}: ${status} (${counts!.pass}✓ ${counts!.warn}⚠ ${counts!.fail}✗)`}
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

// ─── UI atoms ─────────────────────────────────────────────────────────────────

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

function StatusBadge({ status }: { status: VariantStatus }) {
  const bucket = STATUS_BUCKET[status]
  const label = STATUS_LABEL[status]
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0',
      bucket === 'pass' && 'bg-green-100 text-green-700',
      bucket === 'warn' && 'bg-amber-100 text-amber-700',
      bucket === 'fail' && 'bg-red-100 text-red-700',
    )}>
      {bucket === 'pass' ? <CheckCircle size={9} /> : bucket === 'warn' ? <AlertTriangle size={9} /> : <XCircle size={9} />}
      {label}
    </span>
  )
}

/** Compact label for a claimed substitution / indel (used as secondary text). */
function claimLabel(r: DetectedVariant): string | null {
  if (r.claimedSub) return `${r.claimedSub.wt}${r.claimedSub.pos}${r.claimedSub.mut}`
  if (r.claimedIndel) {
    const { type, pos, claimedLength, insertedSeq } = r.claimedIndel
    if (type === 'insertion' && insertedSeq) {
      const display = insertedSeq.length > 6 ? `${insertedSeq.slice(0, 6)}…` : insertedSeq
      return `+[${display}]@${pos}`
    }
    return type === 'deletion' ? `Δ${claimedLength}@${pos}` : `+${claimedLength}@${pos}`
  }
  return null
}

/**
 * Informational badge for newly-introduced Type IIS recognition sites.
 *
 * Does NOT change pass/fail status — some library designs intentionally
 * introduce these sites. We just surface the fact that a BsaI/BsmBI site
 * appeared that wasn't in the CDS at the same position.
 */
function TypeIISBadge({ sites }: { sites: TypeIISSite[] }) {
  if (sites.length === 0) return null
  // Count distinct enzymes for the badge label.
  const enzymes = new Set(sites.map(s => s.enzyme))
  const label = [...enzymes].sort().join(' + ') + ' site' + (sites.length > 1 ? 's' : '')
  const detail = sites
    .map(s => `${s.enzyme} ${s.strand} @${s.position} (${s.sequence})`)
    .join('\n')
  return (
    <span
      title={`New Type IIS site${sites.length > 1 ? 's' : ''} not in CDS:\n${detail}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 bg-purple-100 text-purple-700"
    >
      <AlertTriangle size={9} />
      {label}
    </span>
  )
}

function OligoRow({ result }: { result: OligoResult }) {
  const det = result.detected
  const bucket = bucketOf(det.status)
  const claim = claimLabel(det)
  const detectedSummary = det.diffs.length > 0
    ? det.diffs.map(describeDiff).join('; ')
    : det.status === 'warn_no_change' ? 'no change vs WT' : null

  return (
    <div className={cn(
      'rounded-lg px-3 py-2 text-xs',
      bucket === 'fail' ? 'bg-red-50' : bucket === 'warn' ? 'bg-amber-50' : 'bg-green-50',
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-gray-700 truncate flex-1 min-w-0">{result.id}</span>
        <div className="flex items-center gap-2 shrink-0">
          {detectedSummary && (
            <span className="font-mono text-[10px] text-gray-700 bg-white px-1.5 py-0.5 rounded border border-gray-200">
              {detectedSummary}
            </span>
          )}
          {claim && (
            <span className="text-gray-400 font-mono text-[10px]" title="ID claim">
              claim: {claim}
            </span>
          )}
          <TypeIISBadge sites={det.typeIISSites} />
          <StatusBadge status={det.status} />
        </div>
      </div>
      {det.problems.length > 0 && (
        <ul className={cn('mt-1 space-y-0.5 text-[11px]',
          bucket === 'fail' ? 'text-red-600' : 'text-amber-700')}>
          {det.problems.map((p, i) => <li key={i}>• {p}</li>)}
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
    const parsed = manualCdsStart.trim() ? parseInt(manualCdsStart) - 1 : undefined
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

  // Counts per status, plus a frameshift count derived from detected diffs.
  const counts = result ? (() => {
    const out = {
      pass: 0,
      pass_unclaimed: 0,
      warn_mismatch: 0,
      warn_no_change: 0,
      fail_alignment: 0,
      frameshifts: 0,
    }
    for (const r of result.results) {
      out[r.detected.status]++
      if (r.detected.diffs.some(d => (d.type === 'del' || d.type === 'ins') && !d.inFrame)) {
        out.frameshifts++
      }
    }
    return out
  })() : null

  const passBucketCount = counts ? counts.pass + counts.pass_unclaimed : 0
  const warnBucketCount = counts ? counts.warn_mismatch + counts.warn_no_change : 0
  const failBucketCount = counts ? counts.fail_alignment : 0

  const issues = result?.results.filter(r => bucketOf(r.detected.status) !== 'pass') ?? []
  const passed = result?.results.filter(r => bucketOf(r.detected.status) === 'pass') ?? []

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
          <p className="text-xs text-gray-400 mt-0.5">Validate oligos against reference CDS — detects synthesis failures, wrong variants, and frameshifts directly from sequence</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FileZone label="Reference FASTA" accept=".fasta,.fa,.fna,.txt" loaded={refLabel} onFile={loadRef} inputRef={refRef} />
            <FileZone label="Oligo CSV (id,sequence)" accept=".csv,.txt" loaded={csvLabel} onFile={loadCsv} inputRef={csvRef} />
          </div>

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
                <SummaryStat label="Pass" value={passBucketCount.toLocaleString()} color="green" />
                <SummaryStat label="Warn" value={warnBucketCount.toLocaleString()} color="amber" />
                <SummaryStat label="Fail" value={failBucketCount.toLocaleString()} color="red" />
              </div>

              {/* Status breakdown chips */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                {counts.pass > 0 && (
                  <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">
                    {counts.pass.toLocaleString()} pass
                  </span>
                )}
                {counts.pass_unclaimed > 0 && (
                  <span className="px-2 py-0.5 rounded bg-green-50 text-green-600 border border-green-200">
                    {counts.pass_unclaimed.toLocaleString()} unclaimed (variant detected, no ID claim)
                  </span>
                )}
                {counts.warn_mismatch > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                    {counts.warn_mismatch.toLocaleString()} mismatch (detected ≠ claimed)
                  </span>
                )}
                {counts.warn_no_change > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                    {counts.warn_no_change.toLocaleString()} no change (synthesis failure?)
                  </span>
                )}
                {counts.fail_alignment > 0 && (
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-700">
                    {counts.fail_alignment.toLocaleString()} no alignment
                  </span>
                )}
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

              {passBucketCount > 0 && (
                <section>
                  <button type="button" onClick={() => setShowPassed(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    {showPassed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {passBucketCount.toLocaleString()} passed — {showPassed ? 'hide' : 'show'}
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
