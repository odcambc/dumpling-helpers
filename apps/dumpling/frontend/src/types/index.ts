export type ScoringBackend = 'rosace' | 'lilace' | 'rosace_aa'
export type Aligner = 'bbmap' | 'minimap2'
export type BbtoolsCompression = 'pigz' | 'bgzip' | 'none'
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
  aligner: Aligner
  enrich2: boolean
  keep_enrich_h5: boolean
  deposit_to_mavedb: boolean
  run_cosmos: boolean
  remove_zeros: boolean
  run_qc: boolean
  noprocess: boolean

  // Advanced
  max_deletion_length: number
  kmers: number
  sam: string
  min_q: number
  min_variant_obs: number
  lilace_seed: number | null

  // Memory (per-rule allocations)
  mem: number
  mem_fastqc: number
  mem_rosace: number
  mem_rosace_aa: number
  mem_lilace: number
  mem_bbduk: number
  mem_bbmerge: number
  mem_bbmap: number
  mem_minimap2: number
  mem_gatk: number
  mem_process_sample: number
  mem_cosmos: number

  // Environment
  samtools_local: boolean
  rosace_local: boolean
  lilace_local: boolean
  rosace_aa_local: boolean
  bbtools_compression: BbtoolsCompression

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
  phenotype: number | ''
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
