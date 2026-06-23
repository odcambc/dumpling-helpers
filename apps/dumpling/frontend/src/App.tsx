import { useState, useEffect, useRef } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { configSchema, configDefaults, type ConfigFormValues } from '@/schemas/config'
import { makeEmptyRow, validateSampleTable, type SampleRowValues } from '@/schemas/experiments'
import type { ExperimentMode, WizardStep, RunConfig } from '@/types'
import { api, type Capabilities } from '@/api/client'
import { ImportButton } from '@/components/ImportButton'
import { StepExperiment } from '@/components/wizard/StepExperiment'
import { StepPaths } from '@/components/wizard/StepPaths'
import { StepPipeline } from '@/components/wizard/StepPipeline'
import { StepRunCommand } from '@/components/wizard/StepRunCommand'
import { SampleTable } from '@/components/SampleTable/SampleTable'
import { Preview } from '@/components/Preview/Preview'
import { StructureView } from '@/components/structure/StructureView'
import { Button, usePersistedState, SuiteBrand, SuiteSwitcher, HelpMenu } from '@dumplingkit/ui'
import { cn } from '@/lib/utils'
import { buildSlurmProfile, buildSgeProfile, getProfilePath } from '@/lib/runCommand'
import JSZip from 'jszip'
import yaml from 'js-yaml'
import Papa from 'papaparse'

const STEPS: { label: string; title: string }[] = [
  { label: 'Experiment', title: 'Experiment identity' },
  { label: 'Paths', title: 'Data & reference paths' },
  { label: 'Pipeline', title: 'Pipeline options' },
  { label: 'Samples', title: 'Sample table' },
  { label: 'Run', title: 'Run command' },
]

// Form fields owned by each wizard step, used to gate Next on per-step
// validation. Step 4 (sample table) has no form fields — it's gated via
// validateSampleTable; step 5 (run command) has nothing to validate.
const STEP1_FIELDS: (keyof ConfigFormValues)[] = ['experiment', 'experiment_file', 'baseline_condition']
const STEP2_FIELDS: (keyof ConfigFormValues)[] = ['data_dir', 'ref_dir', 'reference', 'orf', 'variants_file', 'regenerate_variants', 'oligo_file']
// Step 3 is everything else the form owns (pipeline / advanced / memory / env).
const STEP3_FIELDS: (keyof ConfigFormValues)[] = (Object.keys(configDefaults) as (keyof ConfigFormValues)[]).filter(
  (k) => !STEP1_FIELDS.includes(k) && !STEP2_FIELDS.includes(k),
)
const STEP_FIELDS: (keyof ConfigFormValues)[][] = [STEP1_FIELDS, STEP2_FIELDS, STEP3_FIELDS]

const STORAGE_PREFIX = 'souschef:dumpling:v1'

export default function App() {
  const [step, setStep] = useState<WizardStep>(1)
  const [rows, setRows] = usePersistedState<SampleRowValues[]>(`${STORAGE_PREFIX}:rows`, [makeEmptyRow()])
  const [mode, setMode] = usePersistedState<ExperimentMode>(`${STORAGE_PREFIX}:mode`, 'timecourse')
  const [includeTile, setIncludeTile] = usePersistedState(`${STORAGE_PREFIX}:includeTile`, false)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [capStatus, setCapStatus] = useState<'loading' | 'ready' | 'unreachable'>('loading')
  const [runConfig, setRunConfig] = usePersistedState<RunConfig>(`${STORAGE_PREFIX}:runConfig`, { env: 'local', local: { cores: 8 } })
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadSuccess, setDownloadSuccess] = useState(false)
  const [previewTab, setPreviewTab] = useState<'structure' | 'files'>('structure')
  const [draftRestored, setDraftRestored] = useState(false)
  // Steps the user has validated at least once (by hitting Next or navigating
  // away). A step's rail badge stays a neutral number until it's been visited —
  // only then does it resolve to a green ✓ or a red ! based on its errors.
  const [visited, setVisited] = useState<Set<number>>(() => new Set())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const form = useForm<ConfigFormValues>({
    // configSchema uses z.default() on many fields, so zod's *input* type has
    // them optional while ConfigFormValues (z.infer = output) has them required.
    // configDefaults supplies every field, so input === output at runtime; cast
    // the resolver to the output type rather than splitting the form generics
    // (which would ripple input-typing through every wizard step and watch()).
    resolver: zodResolver(configSchema) as unknown as Resolver<ConfigFormValues>,
    defaultValues: configDefaults,
    mode: 'onBlur',
  })

  const config = form.watch()
  const { errors } = form.formState

  // The cosmos phenotype column is only meaningful when run_cosmos is on (or a
  // loaded CSV already carries phenotype values).
  const includePhenotype = config.run_cosmos || rows.some((r) => r.phenotype != null)

  useEffect(() => {
    api
      .capabilities()
      .then((c) => {
        setCapabilities(c)
        setCapStatus('ready')
      })
      .catch(() => {
        setCapabilities(null)
        setCapStatus('unreachable')
      })
  }, [])

  // Persist the config form to localStorage (debounced) and restore any draft on
  // mount. Restore deliberately does NOT gate on configSchema.safeParse: the
  // schema's superRefine requires variants_file/oligo_file, which an in-progress
  // draft won't satisfy — so we merge the raw draft over defaults and let the
  // form re-validate live.
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
      // Corrupt draft — ignore and start fresh.
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
          // Persistence is best-effort.
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
    if (target === 4) return validateSampleTable(rows).size === 0
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
    if (target === 4) return validateSampleTable(rows).size > 0
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
    setMode('timecourse')
    setIncludeTile(false)
    setRunConfig({ env: 'local', local: { cores: 8 } })
    setStep(1)
    setVisited(new Set())
    setDraftRestored(false)
  }

  async function handleDownload() {
    const valid = await form.trigger()
    if (!valid) return

    setDownloading(true)
    setDownloadError(null)
    setDownloadSuccess(false)

    try {
      // Validate server-side, then build ZIP client-side so we can append profile
      const [configErrors, expErrors] = await Promise.all([
        api.validateConfig(config),
        api.validateExperiments(rows, mode, includeTile),
      ])

      const allErrors = [
        ...configErrors.errors.map((e) => `config: ${e.message}`),
        ...expErrors.errors.map((e) => `experiments row ${(e.row ?? 0) + 1}: ${e.message}`),
      ]
      if (allErrors.length > 0) {
        setDownloadError(allErrors.slice(0, 3).join('; '))
        return
      }

      const zip = new JSZip()

      // config.yaml
      const contaminants = config.contaminants.split(',').map((s) => s.trim()).filter(Boolean)
      const configData = {
        ...config,
        contaminants: contaminants.length === 1 ? contaminants[0] : contaminants,
        ...(config.baseline_condition === '' ? { baseline_condition: undefined } : {}),
        ...(!config.enrich2 ? { remove_zeros: undefined, keep_enrich_h5: undefined } : {}),
        ...(!config.regenerate_variants ? { oligo_file: undefined } : {}),
        ...(config.lilace_seed === null ? { lilace_seed: undefined } : {}),
      }
      zip.file('config.yaml', '# Generated by dumpling-helpers\n' + yaml.dump(configData, { sortKeys: false }))

      // experiments.csv
      const fields = ['sample', 'condition', 'replicate', mode === 'timecourse' ? 'time' : 'bin', ...(includeTile ? ['tile'] : []), ...(includePhenotype ? ['phenotype'] : []), 'file']
      const csvData = rows.map((r) => ({
        sample: r.sample, condition: r.condition, replicate: r.replicate,
        [mode === 'timecourse' ? 'time' : 'bin']: r.timeOrBin,
        ...(includeTile ? { tile: r.tile ?? 1 } : {}),
        ...(includePhenotype ? { phenotype: r.phenotype ?? '' } : {}),
        file: r.file,
      }))
      zip.file('experiments.csv', Papa.unparse(csvData, { columns: fields, newline: '\n' }))

      // cluster profile (if selected)
      if (runConfig.env === 'slurm' && runConfig.slurm.includeProfile) {
        const profile = buildSlurmProfile(runConfig.slurm, config)
        zip.file(getProfilePath('slurm'), profile)
      } else if (runConfig.env === 'sge' && runConfig.sge.includeProfile) {
        const profile = buildSgeProfile(runConfig.sge, config)
        zip.file(getProfilePath('sge'), profile)
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${config.experiment || 'dumpling'}-config.zip`
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
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <SuiteBrand subtitle="dumpling · config generator" />
            <HelpMenu />
          </div>
          <SuiteSwitcher
            current="dumpling"
            renderLink={(to, className, children) => (
              <Link to={to} className={className}>
                {children}
              </Link>
            )}
          />
        </div>

        {/* Steps */}
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

        {/* Import */}
        <div className="px-4 pb-3">
          <ImportButton
            onImport={({ config, experiments }) => {
              if (config) form.reset({ ...configDefaults, ...config.config })
              if (experiments) {
                setRows(experiments.rows)
                setMode(experiments.mode)
                setIncludeTile(experiments.includeTile)
              }
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

        {/* Status & Download */}
        <div className="p-4 border-t border-gray-100 space-y-3">
          {capabilities !== null && (
            <p className="text-xs text-gray-400">
              {capabilities.filesystem_access ? '🖥 Local mode' : '☁ Hosted mode'}
              {capabilities.snakemake_available && ' · Snakemake available'}
            </p>
          )}

          {capStatus === 'unreachable' && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              Backend unreachable — config validation and ZIP download need the API running.
            </div>
          )}

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

          <Button
            type="button"
            className="w-full"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Download ZIP
          </Button>
        </div>
      </aside>

      {/* ── Form area ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-xl">
            <form>
              {step === 1 && <StepExperiment form={form} />}
              {step === 2 && <StepPaths form={form} />}
              {step === 3 && <StepPipeline form={form} />}
              {step === 4 && (
                <SampleTable
                  rows={rows}
                  mode={mode}
                  includeTile={includeTile}
                  includePhenotype={includePhenotype}
                  dataDir={config.data_dir}
                  capabilities={capabilities}
                  onChange={setRows}
                  onModeChange={setMode}
                  onIncludeTileChange={setIncludeTile}
                />
              )}
              {step === 5 && (
                <StepRunCommand
                  config={config}
                  runConfig={runConfig}
                  onChange={setRunConfig}
                />
              )}
            </form>
          </div>
        </div>

        {/* Prev / Next navigation */}
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
            <Button
              type="button"
              onClick={() => void goNext()}
            >
              Next →
            </Button>
          ) : (
            // Spacer to keep `justify-between` three-column layout balanced.
            <div aria-hidden className="invisible">
              <Button type="button" tabIndex={-1}>Next →</Button>
            </div>
          )}
        </div>
      </main>

      {/* ── Live preview panel ───────────────────────────── */}
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
            <Preview config={config} rows={rows} mode={mode} includeTile={includeTile} includePhenotype={includePhenotype} />
          )}
        </div>
      </aside>
    </div>
  )
}
