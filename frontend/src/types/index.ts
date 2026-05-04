export type ScoringBackend = 'rosace' | 'lilace'
export type ExperimentMode = 'timecourse' | 'facs'

export interface ConfigFormValues {
  // Step 1: Experiment identity
  experiment: string
  experiment_file: string
  baseline_condition: string

  // Step 2: Paths
  data_dir: string
  ref_dir: string
  reference: string
  orf: string
  variants_file: string
  regenerate_variants: boolean
  oligo_file: string

  // Step 3: Pipeline options
  scoring_backend: ScoringBackend
  enrich2: boolean
  remove_zeros: boolean
  run_qc: boolean
  noprocess: boolean

  // Advanced
  max_deletion_length: number
  kmers: number
  sam: string
  min_q: number
  min_variant_obs: number
  mem: number
  mem_fastqc: number
  mem_rosace: number
  mem_lilace: number

  // Environment
  samtools_local: boolean
  rosace_local: boolean
  lilace_local: boolean
  bbtools_use_bgzip: boolean

  // Resources
  adapters: string
  contaminants: string
}

export interface SampleRow {
  id: string
  sample: string
  condition: string
  replicate: number | ''
  timeOrBin: number | ''
  tile: number | ''
  file: string
}

export interface Capabilities {
  filesystem_access: boolean
  snakemake_available: boolean
  version: string
}

export type WizardStep = 1 | 2 | 3 | 4 | 5

export type RunEnvironment = 'local' | 'slurm' | 'sge'

export interface LocalRunConfig {
  cores: number
}

export interface SlurmRunConfig {
  partition: string
  maxJobs: number
  defaultTimeMins: number
  includeProfile: boolean
}

export interface SgeRunConfig {
  queue: string
  maxJobs: number
  includeProfile: boolean
}

export type RunConfig =
  | { env: 'local'; local: LocalRunConfig }
  | { env: 'slurm'; slurm: SlurmRunConfig }
  | { env: 'sge'; sge: SgeRunConfig }
