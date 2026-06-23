import { useCallback, useRef, useState } from 'react'
import { Plus, Trash2, ClipboardPaste, Upload, AlertTriangle } from 'lucide-react'
import type { SampleRowValues } from '@/schemas/samples'
import { makeEmptyRow, validateSampleTable } from '@/schemas/samples'
import { Button } from '@dumplingkit/ui'
import { cn } from '@/lib/utils'
import { importSamplesCsv } from '@/lib/importers'

interface Props {
  rows: SampleRowValues[]
  onChange: (rows: SampleRowValues[]) => void
}

export function SampleTable({ rows, onChange }: Props) {
  const errors = validateSampleTable(rows)
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])

  const updateRow = useCallback(
    (idx: number, patch: Partial<SampleRowValues>) => {
      onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
    },
    [rows, onChange],
  )

  const addRow = () => onChange([...rows, makeEmptyRow()])
  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx))

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      const lines = text.trim().split('\n').filter(Boolean)
      const parsed = lines
        // Skip a header row pasted along with the data.
        .filter((line) => line.split('\t')[0]?.trim().toLowerCase() !== 'sample')
        .map((line): SampleRowValues => {
          const cols = line.split('\t').map((c) => c.trim())
          return {
            id: crypto.randomUUID(),
            sample: cols[0] ?? '',
            condition: cols[1] ?? '',
            replicate: Number(cols[2]) || 1,
            time: cols[3] || '0',
            tile: cols[4] || '1',
            file: cols[5] ?? '',
          }
        })
      if (parsed.length > 0) onChange([...rows, ...parsed])
    },
    [rows, onChange],
  )

  const handleCsvUpload = useCallback(
    async (file: File) => {
      setUploadError(null)
      setUploadWarnings([])
      try {
        const text = await file.text()
        const imported = importSamplesCsv(text)
        const hasContent = rows.some((r) => r.sample.trim() || r.condition.trim() || r.file.trim())
        if (hasContent) {
          const ok = window.confirm(
            `Replace ${rows.length} existing row${rows.length === 1 ? '' : 's'} with ` +
              `${imported.rows.length} from ${file.name}?`,
          )
          if (!ok) return
        }
        onChange(imported.rows)
        setUploadWarnings(imported.warnings)
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : 'CSV upload failed')
      }
    },
    [rows, onChange],
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleCsvUpload(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleCsvUpload(file)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Sample table</h2>
        <p className="text-sm text-gray-500 mt-1">
          Each row is one sequencing sample. <span className="font-mono text-xs">file</span> is the
          FASTQ prefix (without <span className="font-mono text-xs">_R1_001.fastq.gz</span>). You
          can paste rows directly from a spreadsheet.
        </p>
      </div>

      {/* CSV upload / drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex items-center justify-between gap-3 border-2 border-dashed rounded-md px-3 py-2.5 text-xs transition-colors',
          isDragging
            ? 'border-brand bg-brand-light text-brand-dark'
            : 'border-gray-300 bg-white text-gray-500 hover:border-brand',
        )}
      >
        <span>
          Drop a <span className="font-mono text-gray-700">samples.csv</span> here to populate the
          table
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} />
          Upload CSV
        </Button>
        <input ref={fileInputRef} type="file" accept=".csv" className="sr-only" onChange={handleFileChange} />
      </div>

      {uploadError && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-md p-2.5 text-xs">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {uploadError}
        </div>
      )}

      {uploadWarnings.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-800 rounded-md p-2.5 text-xs">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <ul className="space-y-0.5">
            {uploadWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Paste hint */}
      <div className="relative">
        <textarea
          ref={pasteRef}
          className="sr-only"
          aria-label="Paste area for spreadsheet data"
          onPaste={handlePaste}
          readOnly
        />
        <button
          type="button"
          onClick={() => pasteRef.current?.focus()}
          className="flex items-center gap-1.5 text-xs text-brand hover:text-brand-dark transition-colors"
        >
          <ClipboardPaste size={14} />
          Click here, then paste from a spreadsheet (tab-separated: sample, condition, replicate,
          time, tile, file)
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-xs">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Sample</Th>
              <Th>Condition</Th>
              <Th>Replicate</Th>
              <Th>Time</Th>
              <Th>Tile</Th>
              <Th>File prefix</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-400 text-sm">
                  No samples yet — add a row or paste from a spreadsheet.
                </td>
              </tr>
            )}
            {rows.map((row, idx) => {
              const rowErrors = errors.get(String(idx)) ?? []
              return (
                <tr
                  key={row.id}
                  className={cn('group', rowErrors.length > 0 ? 'bg-red-50' : 'hover:bg-gray-50')}
                >
                  <Td>
                    <CellInput
                      value={row.sample}
                      placeholder="gDNA_fusions"
                      onChange={(v) => updateRow(idx, { sample: v })}
                      hasError={rowErrors.includes('Duplicate sample name')}
                    />
                  </Td>
                  <Td>
                    <CellInput
                      value={row.condition}
                      placeholder="baseline"
                      onChange={(v) => updateRow(idx, { condition: v })}
                    />
                  </Td>
                  <Td>
                    <CellInput
                      type="number"
                      value={String(row.replicate)}
                      placeholder="1"
                      onChange={(v) => updateRow(idx, { replicate: Number(v) })}
                    />
                  </Td>
                  <Td>
                    <CellInput value={row.time} placeholder="0" onChange={(v) => updateRow(idx, { time: v })} />
                  </Td>
                  <Td>
                    <CellInput value={row.tile} placeholder="1" onChange={(v) => updateRow(idx, { tile: v })} />
                  </Td>
                  <Td>
                    <CellInput
                      value={row.file}
                      placeholder="gDNA_S241_L004"
                      onChange={(v) => updateRow(idx, { file: v })}
                      className="font-mono text-xs"
                    />
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Remove row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {errors.size > 0 && (
        <div className="text-xs text-red-600 space-y-0.5">
          {[...errors.entries()].map(([row, msgs]) =>
            msgs.map((m, j) => (
              <p key={`${row}-${j}`}>
                Row {Number(row) + 1}: {m}
              </p>
            )),
          )}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus size={14} />
        Add row
      </Button>
    </div>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide',
        className,
      )}
    >
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-1">{children}</td>
}

interface CellInputProps {
  value: string
  placeholder?: string
  type?: string
  onChange: (value: string) => void
  hasError?: boolean
  className?: string
}

function CellInput({ value, placeholder, type = 'text', onChange, hasError, className }: CellInputProps) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded border px-2 py-1 text-sm focus:outline-2 focus:outline-brand focus:outline-offset-0',
        hasError ? 'border-red-400 bg-red-50' : 'border-transparent focus:border-gray-300 bg-transparent',
        className,
      )}
    />
  )
}
