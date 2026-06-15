import { z } from 'zod'

const CSV = /\.csv$/i
const FASTA = /\.(fasta|fa|fna)$/i
const ORF = /^\d+-\d+$/
// LEFT...RIGHT — the literal "..." marks the barcode window; flanks are ACGT.
const FLANK = /^[ACGTacgt]+\.\.\.[ACGTacgt]+$/

export const configSchema = z.object({
  // ── Experiment & paths ──────────────────────────────────────────────────
  experiment: z.string().min(1, 'Required'),
  data_dir: z.string().min(1, 'Required'),
  ref_dir: z.string().min(1, 'Required').default('references'),
  experiment_file: z
    .string()
    .min(1, 'Required')
    .regex(CSV, 'Must end in .csv')
    .default('config/experiments.csv'),
  reference: z
    .string()
    .min(1, 'Required')
    .regex(FASTA, 'Must be a FASTA (.fasta, .fa, .fna)'),
  gene_name: z.string().default(''),

  // ── Barcode & ORF ───────────────────────────────────────────────────────
  orf: z.string().min(1, 'Required').regex(ORF, 'Format: start-stop (e.g. 198-3237)'),
  flanking_sequence: z
    .string()
    .min(1, 'Required')
    .regex(FLANK, 'Format: LEFT...RIGHT (… marks the barcode window; flanks are ACGT)'),
  max_barcode_length: z.number().int().min(1).default(40),
  barcode_distance: z.number().int().min(0).max(20).default(5),

  // ── Variant calling ─────────────────────────────────────────────────────
  calling_mode: z.enum(['double', 'single_qc']).default('double'),
  min_cluster_size: z.number().int().min(1).default(2),
  use_qual: z.boolean().default(true),
  call_fract: z.number().min(0).max(1).default(0.75),
  mpileup_max_depth: z.number().int().min(1).default(5000),
  qc_min_af: z.number().min(0).max(1).default(0.85),
  qc_min_alt_reads: z.number().int().min(1).default(2),

  // ── Barcode clash detection ─────────────────────────────────────────────
  clash_merge_fraction: z.number().min(0).max(1).default(0.2),
  clash_mixed_af: z.number().min(0).max(1).default(0.2),
  exclude_clashes: z.boolean().default(true),
})

export type ConfigFormValues = z.infer<typeof configSchema>

// Plain defaults — not parsed through the schema so required-field constraints
// don't throw on initial empty values; React Hook Form validates on interaction.
export const configDefaults: ConfigFormValues = {
  experiment: '',
  data_dir: '',
  ref_dir: 'references',
  experiment_file: 'config/experiments.csv',
  reference: '',
  gene_name: '',
  orf: '',
  flanking_sequence: '',
  max_barcode_length: 40,
  barcode_distance: 5,
  calling_mode: 'double',
  min_cluster_size: 2,
  use_qual: true,
  call_fract: 0.75,
  mpileup_max_depth: 5000,
  qc_min_af: 0.85,
  qc_min_alt_reads: 2,
  clash_merge_fraction: 0.2,
  clash_mixed_af: 0.2,
  exclude_clashes: true,
}
