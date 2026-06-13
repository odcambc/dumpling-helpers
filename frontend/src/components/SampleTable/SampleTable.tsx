import { useCallback, useRef, useState } from 'react'
import { Plus, Trash2, ClipboardPaste, ScanSearch, X, Upload, AlertTriangle } from 'lucide-react'
import type { ExperimentMode, Capabilities } from '@/types'
import type { SampleRowValues } from '@/schemas/experiments'
import { makeEmptyRow, validateSampleTable } from '@/schemas/experiments'
import { api } from '@/api/client'
import { Button, Toggle } from '@dumplingkit/ui'
import { cn } from '@/lib/utils'
import { importExperimentsCsv } from '@/lib/importers'
import { CoverageEstimate } from './CoverageEstimate'

interface Props {
  rows: SampleRowValues[]
  mode: ExperimentMode
  includeTile: boolean
  dataDir: string
  capabilities: Capabilities | null
  onChange: (rows: SampleRowValues[]) => void
  onModeChange: (mode: ExperimentMode) => void
  onIncludeTileChange: (v: boolean) => void
}

export function SampleTable({
  rows,
  mode,
  includeTile,
  dataDir,
  capabilities,
  onChange,
  onModeChange,
  onIncludeTileChange,
}: Props) {
  const errors = validateSampleTable(rows)
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [discovered, setDiscovered] = useState<string[] | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])

  async function handleScan() {
    setScanning(true)
    setScanError(null)
    setDiscovered(null)
    try {
      const result = await api.discover(dataDir)
      setDiscovered(result.prefixes)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  function addDiscoveredPrefix(prefix: string) {
    onChange([...rows, { ...makeEmptyRow(), file: prefix }])
  }

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

      // Detect if first row looks like a header (non-numeric first field in replicate column)
      const parsed = lines
        .filter((line) => {
          const cols = line.split('\t')
          // Skip header rows where replicate col is not numeric
          return cols.length >= 4 && !isNaN(Number(cols[2]))
        })
        .map((line): SampleRowValues => {
          const cols = line.split('\t')
          return {
            id: crypto.randomUUID(),
            sample: cols[0]?.trim() ?? '',
            condition: cols[1]?.trim() ?? '',
            replicate: Number(cols[2]) || 1,
            timeOrBin: Number(cols[3]) || 0,
            tile: cols[4] && cols[5] ? (Number(cols[4]) || undefined) : undefined,
            file: (cols[5] ?? cols[4] ?? '').trim(),
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
        const imported = importExperimentsCsv(text)

        // Detect "unsaved" rows worth warning about: any row where at least one
        // user-meaningful field is filled in.
        const hasContent = rows.some(
          (r) => r.sample.trim() || r.condition.trim() || r.file.trim(),
        )
        if (hasContent) {
          const ok = window.confirm(
            `Replace ${rows.length} existing row${rows.length === 1 ? '' : 's'} with `
              + `${imported.rows.length} from ${file.name}?`,
          )
          if (!ok) return
        }

        onChange(imported.rows)
        onModeChange(imported.mode)
        onIncludeTileChange(imported.includeTile)
        setUploadWarnings(imported.warnings)
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : 'CSV upload failed')
      }
    },
    [rows, onChange, onModeChange, onIncludeTileChange],
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

  const timeOrBinLabel = mode === 'timecourse' ? 'Time' : 'Bin'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Sample table</h2>
        <p className="text-sm text-gray-500 mt-1">
          Each row is one sequencing sample. You can paste rows directly from a spreadsheet.
        </p>
      </div>

      {/* Mode controls */}
      <div className="flex flex-wrap gap-6 py-3 border-y border-gray-100">
        <div className="flex gap-2 items-center">
          <span className="text-sm font-medium text-gray-700">Experiment type:</span>
          {(['timecourse', 'facs'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                mode === m
                  ? 'bg-brand text-white border-brand'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50',
              )}
            >
              {m === 'timecourse' ? 'Timecourse' : 'FACS-seq'}
            </button>
          ))}
        </div>
        <Toggle
          checked={includeTile}
          onChange={onIncludeTileChange}
          label="Tiled amplicon sequencing"
        />
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
          Drop an <span className="font-mono text-gray-700">experiments.csv</span>{' '}
          here to populate the table
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={14} />
          Upload CSV
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={handleFileChange}
        />
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

      {/* Paste + scan hints */}
      <div className="flex flex-wrap items-center gap-4">
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
            Click here, then paste from spreadsheet (tab-separated, no header)
          </button>
        </div>

        {capabilities?.filesystem_access && dataDir && (
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            <ScanSearch size={14} />
            {scanning ? 'Scanning…' : 'Scan data directory for FASTQs'}
          </button>
        )}
      </div>

      {/* Scan results */}
      {scanError && (
        <p className="text-xs text-red-600">{scanError}</p>
      )}
      {discovered !== null && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600">
              {discovered.length === 0
                ? 'No FASTQ files found'
                : `${discovered.length} file prefix${discovered.length !== 1 ? 'es' : ''} detected`}
            </p>
            <button type="button" onClick={() => setDiscovered(null)}>
              <X size={14} className="text-gray-400 hover:text-gray-600" />
            </button>
          </div>
          {discovered.length > 0 && (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {discovered.map((prefix) => (
                <li key={prefix} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-gray-700 truncate">{prefix}</span>
                  <button
                    type="button"
                    onClick={() => addDiscoveredPrefix(prefix)}
                    className="shrink-0 text-xs text-brand hover:text-brand-dark font-medium"
                  >
                    + Add row
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-xs">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Sample</Th>
              <Th>Condition</Th>
              <Th>Replicate</Th>
              <Th>{timeOrBinLabel}</Th>
              {includeTile && <Th>Tile</Th>}
              <Th>File prefix</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5 + (includeTile ? 1 : 0)}
                  className="py-8 text-center text-gray-400 text-sm"
                >
                  No samples yet — add a row or paste from a spreadsheet.
                </td>
              </tr>
            )}
            {rows.map((row, idx) => {
              const rowErrors = errors.get(String(idx)) ?? []
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'group',
                    rowErrors.length > 0 ? 'bg-red-50' : 'hover:bg-gray-50',
                  )}
                >
                  <Td>
                    <CellInput
                      value={row.sample}
                      placeholder="A_R1_T0"
                      onChange={(v) => updateRow(idx, { sample: v })}
                      hasError={rowErrors.includes('Duplicate sample name')}
                    />
                  </Td>
                  <Td>
                    <CellInput
                      value={row.condition}
                      placeholder="cond_A"
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
                    <CellInput
                      type="number"
                      value={String(row.timeOrBin)}
                      placeholder="0"
                      onChange={(v) => updateRow(idx, { timeOrBin: Number(v) })}
                    />
                  </Td>
                  {includeTile && (
                    <Td>
                      <CellInput
                        type="number"
                        value={String(row.tile ?? '')}
                        placeholder="1"
                        onChange={(v) => updateRow(idx, { tile: v ? Number(v) : undefined })}
                      />
                    </Td>
                  )}
                  <Td>
                    <CellInput
                      value={row.file}
                      placeholder="1_S1_L001"
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

      {/* Error summary */}
      {errors.size > 0 && (
        <div className="text-xs text-red-600 space-y-0.5">
          {[...errors.entries()].map(([row, msgs]) =>
            msgs.map((m) => (
              <p key={`${row}-${m}`}>
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

      <CoverageEstimate rows={rows} />
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
