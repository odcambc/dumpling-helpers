import { useRef, useState } from 'react'
import { Upload, X, AlertTriangle, CheckCircle } from 'lucide-react'
import type { ConfigFormValues } from '@/schemas/config'
import { configToStructure, type Enrichment } from '@/lib/structure'
import { parseFasta, fastaName } from '@/lib/parseFasta'
import { parsePartnersCsv } from '@/lib/partners'
import { RegionTrack } from '@dumplingkit/ui'
import { cn } from '@/lib/utils'

interface FastaState {
  name: string
  names: Set<string>
  lengths: Map<string, number>
}
interface PartnersState {
  name: string
  included: string[]
  total: number
}

interface Props {
  config: ConfigFormValues
}

export function StructureView({ config }: Props) {
  const [fasta, setFasta] = useState<FastaState | null>(null)
  const [partners, setPartners] = useState<PartnersState | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadFiles(files: FileList | File[]) {
    setError(null)
    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const lower = file.name.toLowerCase()
        if (/\.(fasta|fa|fna|txt)$/.test(lower)) {
          const recs = parseFasta(text)
          if (!recs.length) {
            setError(`No FASTA records in ${file.name}.`)
            continue
          }
          setFasta({
            name: file.name,
            names: new Set(recs.map((r) => fastaName(r.header))),
            lengths: new Map(recs.map((r) => [fastaName(r.header), r.seq.length])),
          })
        } else if (lower.endsWith('.csv')) {
          const rows = parsePartnersCsv(text)
          setPartners({ name: file.name, included: rows.filter((r) => r.include).map((r) => r.name), total: rows.length })
        } else {
          setError(`${file.name}: drop a reference FASTA or a partners CSV.`)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : `Failed to read ${file.name}`)
      }
    }
  }

  const enriched = !!(fasta || partners)
  const enrichment: Enrichment = {
    fastaNames: fasta?.names,
    fastaLengths: fasta?.lengths,
    includedPartners: partners?.included,
  }
  const m = configToStructure(config, enriched ? enrichment : undefined)
  const hasRetained = config.fusion_library.retained.name.trim().length > 0

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <FileDrop fasta={fasta} partners={partners} onFiles={loadFiles} onClearFasta={() => setFasta(null)} onClearPartners={() => setPartners(null)} />
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 px-2.5 py-2 text-xs text-red-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Fusion construct</h3>
        {hasRetained ? (
          <>
            <RegionTrack segments={m.segments} />
            <p className="mt-3 text-xs text-gray-500">
              The <span className="font-medium text-gray-700">{m.truncatedComponent}</span> domain is
              variably truncated — breakpoints are scanned along it.
              {m.linker && (
                <>
                  {' '}Linker: <span className="font-mono text-gray-700">{m.linker}</span>.
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-xs italic text-gray-400">Set the retained domain name (Library step) to see the construct.</p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Fusion library</h3>
        {m.realPartners ? (
          <>
            <p className="text-xs text-gray-600">
              <span className="font-semibold text-brand-dark">{m.fusionCount}</span> fusions ·{' '}
              <span className="text-gray-700">{m.realPartners.length}</span> included partners
              {partners && partners.total !== m.realPartners.length && (
                <span className="text-gray-400"> (of {partners.total} in file)</span>
              )}
            </p>
            <p className="mt-1 max-h-24 overflow-auto font-mono text-[11px] leading-relaxed text-gray-500">
              {m.realPartners.join(', ')}
            </p>
          </>
        ) : (
          <p className="text-xs italic text-gray-400">
            Partners from <span className="font-mono">{m.partnersSource}</span> — drop that CSV above
            for the real fusion set.
          </p>
        )}
      </section>

      {m.variantFusions.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Variant retained fusions</h3>
          <ul className="space-y-1.5">
            {m.variantFusions.map((v, i) => (
              <li key={i} className="rounded-md border border-gray-200 px-3 py-2 text-xs">
                <span className="font-semibold text-brand-dark">{v.retained}</span>
                <span className="text-gray-400"> × </span>
                <span className="text-gray-700">{v.partners}</span>
                {v.description && <p className="mt-0.5 text-gray-400">{v.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Validation */}
      {m.warnings.length > 0 ? (
        <ul className="space-y-1">
          {m.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      ) : fasta ? (
        <p className="flex items-center gap-1.5 text-xs text-green-600">
          <CheckCircle size={13} />
          All names resolve against the reference FASTA.
        </p>
      ) : null}

      <p className="mt-auto border-t border-gray-100 pt-3 text-[11px] text-gray-400">
        {enriched
          ? 'Showing real details from the loaded files.'
          : 'Schematic from settings — drop the reference FASTA + partners CSV above for the real fusion set and name validation.'}
      </p>
    </div>
  )
}

function FileDrop({
  fasta,
  partners,
  onFiles,
  onClearFasta,
  onClearPartners,
}: {
  fasta: FastaState | null
  partners: PartnersState | null
  onFiles: (files: FileList | File[]) => void
  onClearFasta: () => void
  onClearPartners: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".fasta,.fa,.fna,.txt,.csv"
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files)
        }}
        className={cn(
          'w-full flex items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-2 text-xs transition-colors',
          dragOver
            ? 'border-brand bg-brand-light text-brand-dark'
            : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500',
        )}
      >
        <Upload size={13} />
        Drop reference FASTA + partners CSV for real details
      </button>

      <div className="flex flex-wrap gap-2">
        {fasta && <Chip label={fasta.name} detail={`${fasta.names.size} seqs`} onClear={onClearFasta} />}
        {partners && <Chip label={partners.name} detail={`${partners.included.length} partners`} onClear={onClearPartners} />}
      </div>
    </div>
  )
}

function Chip({ label, detail, onClear }: { label: string; detail: string; onClear: () => void }) {
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-[11px] text-green-700">
      <CheckCircle size={12} className="shrink-0" />
      <span className="max-w-[10rem] truncate font-mono">{label}</span>
      <span className="shrink-0 text-green-600">· {detail}</span>
      <button type="button" onClick={onClear} className="shrink-0 text-green-600 hover:text-green-800" aria-label="Clear">
        <X size={12} />
      </button>
    </span>
  )
}
