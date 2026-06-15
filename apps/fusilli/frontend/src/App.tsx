import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { configSchema, configDefaults, type ConfigFormValues } from '@/schemas/config'
import { makeEmptyRow, validateSampleTable, type SampleRowValues } from '@/schemas/samples'
import type { WizardStep } from '@/types'
import { ImportButton } from '@/components/ImportButton'
import { StepExperiment } from '@/components/wizard/StepExperiment'
import { StepLibrary } from '@/components/wizard/StepLibrary'
import { StepDetection } from '@/components/wizard/StepDetection'
import { StepQcResources } from '@/components/wizard/StepQcResources'
import { SampleTable } from '@/components/SampleTable/SampleTable'
import { Preview } from '@/components/Preview/Preview'
import { StructureView } from '@/components/structure/StructureView'
import { Button } from '@dumplingkit/ui'
import { cn } from '@/lib/utils'
import { buildConfigYaml, buildSamplesCsv } from '@/lib/emit'
import JSZip from 'jszip'

const STEPS: { label: string; title: string }[] = [
  { label: 'Experiment', title: 'Experiment & paths' },
  { label: 'Library', title: 'Fusion library' },
  { label: 'Detection', title: 'Detection & sequencing' },
  { label: 'QC', title: 'QC, pipeline & resources' },
  { label: 'Samples', title: 'Sample table' },
]

export default function App() {
  const [step, setStep] = useState<WizardStep>(1)
  const [rows, setRows] = useState<SampleRowValues[]>([makeEmptyRow()])
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadSuccess, setDownloadSuccess] = useState(false)
  const [previewTab, setPreviewTab] = useState<'structure' | 'files'>('structure')

  const form = useForm<ConfigFormValues>({
    // configSchema uses z.default() widely, so zod's *input* type has those fields
    // optional while ConfigFormValues (the output) has them required. configDefaults
    // supplies every field, so input === output at runtime; cast the resolver to the
    // output type rather than threading input-typing through every wizard step.
    resolver: zodResolver(configSchema) as unknown as Resolver<ConfigFormValues>,
    defaultValues: configDefaults,
    mode: 'onBlur',
  })

  const config = form.watch()

  async function handleDownload() {
    const valid = await form.trigger()
    const sampleErrors = validateSampleTable(rows)
    if (!valid || sampleErrors.size > 0) {
      setDownloadError(
        !valid ? 'Fix the highlighted config fields first' : 'Fix the sample table errors first',
      )
      return
    }

    setDownloading(true)
    setDownloadError(null)
    setDownloadSuccess(false)
    try {
      const zip = new JSZip()
      zip.file('config.yaml', buildConfigYaml(config))
      zip.file('samples.csv', buildSamplesCsv(rows))
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${config.experiment || 'fusilli'}-config.zip`
      a.click()
      URL.revokeObjectURL(url)
      setDownloadSuccess(true)
      setTimeout(() => setDownloadSuccess(false), 3000)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-gray-200 bg-white">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-brand flex items-center justify-center">
              <span className="text-white text-xs font-bold">F</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm">fusilli</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Fusion pipeline config generator</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {STEPS.map(({ label }, i) => {
            const n = (i + 1) as WizardStep
            const isActive = step === n
            const isDone = step > n
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(n)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
                  isActive
                    ? 'bg-brand-light text-brand-dark font-medium'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0',
                    isActive
                      ? 'bg-brand text-white'
                      : isDone
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {isDone ? '✓' : n}
                </span>
                {label}
              </button>
            )
          })}
        </nav>

        <div className="px-4 pb-3">
          <ImportButton
            onImport={({ config: imported, samples }) => {
              if (imported) form.reset(imported.config)
              if (samples) setRows(samples.rows)
            }}
          />
        </div>

        <div className="p-4 border-t border-gray-100 space-y-3">
          {downloadError && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {downloadError}
            </div>
          )}
          {downloadSuccess && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg p-2">
              <CheckCircle size={14} />
              Downloaded!
            </div>
          )}
          <Button type="button" className="w-full" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download ZIP
          </Button>
        </div>
      </aside>

      {/* ── Form area ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-xl">
            <form>
              {step === 1 && <StepExperiment form={form} />}
              {step === 2 && <StepLibrary form={form} />}
              {step === 3 && <StepDetection form={form} />}
              {step === 4 && <StepQcResources form={form} />}
              {step === 5 && <SampleTable rows={rows} onChange={setRows} />}
            </form>
          </div>
        </div>

        <div className="shrink-0 flex justify-between items-center px-8 py-4 border-t border-gray-100 bg-white">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => Math.max(1, s - 1) as WizardStep)}
            disabled={step === 1}
          >
            ← Back
          </Button>
          <span className="text-xs text-gray-400">Step {step} of {STEPS.length}</span>
          {step < 5 ? (
            <Button type="button" onClick={() => setStep((s) => Math.min(5, s + 1) as WizardStep)}>
              Next →
            </Button>
          ) : (
            <div aria-hidden className="invisible">
              <Button type="button" tabIndex={-1}>Next →</Button>
            </div>
          )}
        </div>
      </main>

      {/* ── Live preview ─────────────────────────────────── */}
      <aside className="w-96 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-100 shrink-0 flex gap-1">
          {(['structure', 'files'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPreviewTab(t)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                previewTab === t
                  ? 'bg-brand-light text-brand-dark'
                  : 'text-gray-500 hover:bg-gray-50',
              )}
            >
              {t === 'structure' ? 'Structure' : 'Files'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden p-4">
          {previewTab === 'structure' ? (
            <StructureView config={config} />
          ) : (
            <Preview config={config} rows={rows} />
          )}
        </div>
      </aside>
    </div>
  )
}
