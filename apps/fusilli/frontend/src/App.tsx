import { useState, useEffect, useRef } from 'react'
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
import { Button, usePersistedState, SuiteBrand, SuiteSwitcher, HelpMenu } from '@dumplingkit/ui'
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

// Form fields (top-level keys; trigger() validates each object subtree) owned by
// each step, for gating Next. Step 5 (sample table) is gated via validateSampleTable.
const STEP_FIELDS: (keyof ConfigFormValues)[][] = [
  ['experiment', 'data_dir', 'ref_dir', 'samples_file'],
  ['fusion_library'],
  ['detection', 'sequencing', 'quick'],
  ['qc', 'pipeline', 'resources'],
]

const STORAGE_PREFIX = 'souschef:fusilli:v1'

export default function App() {
  const [step, setStep] = useState<WizardStep>(1)
  const [rows, setRows] = usePersistedState<SampleRowValues[]>(`${STORAGE_PREFIX}:rows`, [makeEmptyRow()])
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadSuccess, setDownloadSuccess] = useState(false)
  const [previewTab, setPreviewTab] = useState<'structure' | 'files'>('structure')
  const [draftRestored, setDraftRestored] = useState(false)
  // Steps validated at least once (via Next or navigating away). A rail badge
  // stays a neutral number until visited, then resolves to ✓ or ! by its errors.
  const [visited, setVisited] = useState<Set<number>>(() => new Set())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const { errors } = form.formState

  // Persist the config form (debounced) and restore any draft on mount. Restore
  // doesn't gate on configSchema.safeParse — superRefine on variant_retained /
  // quick.fraction can fail for an in-progress draft — so we merge over defaults
  // and let the form re-validate live.
  useEffect(() => {
    const CONFIG_KEY = `${STORAGE_PREFIX}:config`
    try {
      const raw = localStorage.getItem(CONFIG_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ConfigFormValues>
        form.reset({ ...configDefaults, ...parsed })
        setDraftRestored(true)
      }
    } catch {
      // Corrupt draft — ignore.
    }
    // RHF's documented subscribe pattern: watch() returns a subscription we
    // tear down on unmount; the rule's memoization concern doesn't apply here.
    // eslint-disable-next-line react-hooks/incompatible-library
    const sub = form.watch((values) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        try {
          localStorage.setItem(CONFIG_KEY, JSON.stringify(values))
        } catch {
          // best-effort
        }
      }, 400)
    })
    return () => {
      sub.unsubscribe()
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Per-step gating: validate only the current step's fields before advancing.
  async function validateStep(target: WizardStep): Promise<boolean> {
    if (target === 5) return validateSampleTable(rows).size === 0
    const fields = STEP_FIELDS[target - 1]
    return fields ? form.trigger(fields) : true
  }

  function markVisited(target: WizardStep) {
    setVisited((v) => (v.has(target) ? v : new Set(v).add(target)))
  }

  async function goNext() {
    const ok = await validateStep(step)
    markVisited(step)
    if (ok) setStep((s) => Math.min(5, s + 1) as WizardStep)
  }

  // Rail navigation is free, but leaving a step validates it so its badge
  // reflects reality (a skipped, never-visited step stays neutral).
  function goToStep(target: WizardStep) {
    void validateStep(step)
    markVisited(step)
    setStep(target)
  }

  function stepHasError(target: WizardStep): boolean {
    if (target === 5) return validateSampleTable(rows).size > 0
    const fields = STEP_FIELDS[target - 1]
    if (!fields) return false
    const errs = errors as Record<string, unknown>
    return fields.some((f) => errs[f] != null)
  }

  // Discard the saved draft and reset every field to defaults.
  function startOver() {
    if (!window.confirm('Discard the current draft and reset all fields?')) return
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}:config`)
    } catch {
      // ignore
    }
    form.reset(configDefaults)
    setRows([makeEmptyRow()])
    setStep(1)
    setVisited(new Set())
    setDraftRestored(false)
  }

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
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <SuiteBrand subtitle="fusilli · config generator" />
            <HelpMenu />
          </div>
          <SuiteSwitcher current="fusilli" />
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {STEPS.map(({ label }, i) => {
            const n = (i + 1) as WizardStep
            const isActive = step === n
            const wasVisited = visited.has(n)
            const hasError = wasVisited && stepHasError(n)
            const isDone = wasVisited && !hasError
            return (
              <button
                key={label}
                type="button"
                onClick={() => goToStep(n)}
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
                      : hasError
                        ? 'bg-red-100 text-red-700'
                        : isDone
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {isActive ? n : hasError ? '!' : isDone ? '✓' : n}
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
          <button
            type="button"
            onClick={startOver}
            className="mt-2 text-[11px] text-gray-400 underline hover:text-gray-600 transition-colors"
          >
            {draftRestored ? 'Draft restored — start over' : 'Start over'}
          </button>
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
            <Button type="button" onClick={() => void goNext()}>
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
