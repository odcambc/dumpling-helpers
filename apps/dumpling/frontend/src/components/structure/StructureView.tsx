import { useRef, useState } from 'react'
import { Upload, X, AlertTriangle, CheckCircle } from 'lucide-react'
import type { ConfigFormValues } from '@/schemas/config'
import { configToStructure } from '@/lib/structure'
import { parseFasta } from '@/lib/parseFasta'
import { RegionTrack } from '@dumplingkit/ui'
import { cn } from '@/lib/utils'

interface LoadedRef {
  name: string
  seq: string
  recordCount: number
}

interface Props {
  config: ConfigFormValues
}

function basename(p: string): string {
  return p.split('/').pop() ?? p
}

export function StructureView({ config }: Props) {
  const [loaded, setLoaded] = useState<LoadedRef | null>(null)
  const [error, setError] = useState<string | null>(null)

  const s = configToStructure(config, loaded?.seq)

  async function loadFile(file: File) {
    setError(null)
    try {
      const records = parseFasta(await file.text())
      if (records.length === 0) {
        setError('No FASTA records found in that file.')
        return
      }
      setLoaded({ name: file.name, seq: records[0].seq, recordCount: records.length })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read file')
    }
  }

  const nameMismatch =
    loaded && config.reference && basename(config.reference) !== loaded.name

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <FastaDrop loaded={loaded} onFile={loadFile} onClear={() => { setLoaded(null); setError(null) }} />

      {error && (
        <Banner tone="error">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {error}
        </Banner>
      )}
      {nameMismatch && (
        <Banner tone="warn">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            Loaded <span className="font-mono">{loaded!.name}</span>, but the config references{' '}
            <span className="font-mono">{basename(config.reference)}</span>.
          </span>
        </Banner>
      )}
      {loaded && loaded.recordCount > 1 && (
        <Banner tone="warn">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {loaded.recordCount} records in the FASTA — using the first.
        </Banner>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Reference &amp; ORF
        </h3>
        {s.valid ? (
          <>
            <RegionTrack segments={s.segments} leftCap="" rightCap="" />
            <p className="mt-3 text-xs text-gray-500">
              ORF <span className="font-mono text-gray-700">{s.start}–{s.stop}</span> ·{' '}
              <span className="text-gray-700">{s.codons} codons</span>
              {s.refLength !== undefined && (
                <> · reference <span className="text-gray-700">{s.refLength.toLocaleString()} nt</span></>
              )}
              {s.startCodon && (
                <> · start <span className="font-mono text-gray-700">{s.startCodon}</span></>
              )}
            </p>

            {s.warnings.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {s.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            ) : loaded ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle size={13} />
                ORF checks pass — in-frame, ATG start, stop codon, within bounds.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xs italic text-gray-400">{s.note}</p>
        )}
      </section>

      <p className="mt-auto border-t border-gray-100 pt-3 text-[11px] text-gray-400">
        {loaded
          ? 'Showing real details from the loaded reference FASTA.'
          : 'Schematic from settings — drop the reference FASTA above for true length + ORF validation.'}
      </p>
    </div>
  )
}

function FastaDrop({
  loaded,
  onFile,
  onClear,
}: {
  loaded: LoadedRef | null
  onFile: (f: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  if (loaded) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-green-700">
          <CheckCircle size={13} className="shrink-0" />
          <span className="truncate font-mono">{loaded.name}</span>
          <span className="shrink-0 text-green-600">· {loaded.seq.length.toLocaleString()} nt</span>
        </span>
        <button type="button" onClick={onClear} className="shrink-0 text-green-600 hover:text-green-800" aria-label="Clear reference">
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".fasta,.fa,.fna,.txt"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
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
          const f = e.dataTransfer.files[0]
          if (f) onFile(f)
        }}
        className={cn(
          'w-full flex items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-2 text-xs transition-colors',
          dragOver
            ? 'border-brand bg-brand-light text-brand-dark'
            : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500',
        )}
      >
        <Upload size={13} />
        Drop the reference FASTA for real details
      </button>
    </div>
  )
}

function Banner({ tone, children }: { tone: 'error' | 'warn'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md px-2.5 py-2 text-xs',
        tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800',
      )}
    >
      {children}
    </div>
  )
}
