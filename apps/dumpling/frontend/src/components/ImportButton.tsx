import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { importConfigYaml, importExperimentsCsv, type ImportedConfig, type ImportedExperiments } from '@/lib/importers'
import { cn } from '@/lib/utils'

interface ImportResult {
  config?: ImportedConfig
  experiments?: ImportedExperiments
  errors: string[]
}

interface Props {
  onImport: (result: ImportResult) => void
}

export function ImportButton({ onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function processFiles(files: FileList | File[]) {
    const fileArr = Array.from(files)
    const result: ImportResult = { errors: [] }
    const loadedNames: string[] = []

    for (const file of fileArr) {
      const text = await file.text()
      const lower = file.name.toLowerCase()

      try {
        if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
          result.config = importConfigYaml(text)
          loadedNames.push(file.name)
        } else if (lower.endsWith('.csv')) {
          result.experiments = importExperimentsCsv(text)
          loadedNames.push(file.name)
        } else {
          result.errors.push(`"${file.name}" is not a .yaml or .csv file`)
        }
      } catch (e) {
        result.errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (result.errors.length > 0) {
      setBanner({ type: 'error', message: result.errors.join('; ') })
    } else if (loadedNames.length > 0) {
      const allWarnings = [
        ...(result.config?.warnings ?? []),
        ...(result.experiments?.warnings ?? []),
      ]
      const suffix = allWarnings.length > 0 ? ` (${allWarnings.length} warning${allWarnings.length > 1 ? 's' : ''})` : ''
      setBanner({ type: 'success', message: `Loaded ${loadedNames.join(', ')}${suffix} — review and download` })
      setTimeout(() => setBanner(null), 5000)
    }

    if (result.config || result.experiments) {
      onImport(result)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) processFiles(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".yaml,.yml,.csv"
        className="sr-only"
        onChange={handleChange}
        aria-label="Load existing config files"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed text-xs transition-colors',
          dragOver
            ? 'border-brand bg-brand-light text-brand-dark'
            : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500',
        )}
      >
        <Upload size={13} />
        Load existing files
      </button>

      {banner && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs',
            banner.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600',
          )}
        >
          <span className="flex-1">{banner.message}</span>
          <button type="button" onClick={() => setBanner(null)} className="shrink-0 mt-0.5">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
