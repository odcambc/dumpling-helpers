import { z } from 'zod'

const CSV = /\.csv$/i
const FASTA = /\.(fasta|fa|fna)$/i
const DNA = /^[ACGTacgt]*$/
const NAME = /^[a-zA-Z0-9_-]+$/

// Optional path fields: blank is allowed; if filled, must look like a CSV.
const optionalCsv = z
  .string()
  .default('')
  .refine((v) => v === '' || CSV.test(v), 'Must end in .csv')

const variantRetainedSchema = z.object({
  name: z.string().min(1, 'Required'),
  all_partners: z.boolean().default(false),
  // Comma-separated in the UI; folded to a string[] on emit.
  partners: z.string().default(''),
  description: z.string().default(''),
})

export const configSchema = z
  .object({
    // ── Experiment & paths ────────────────────────────────────────────────
    experiment: z
      .string()
      .min(1, 'Required')
      .max(100, 'Too long (max 100)')
      .regex(NAME, 'Letters, digits, underscore and dash only'),
    data_dir: z.string().min(1, 'Required'),
    ref_dir: z.string().min(1, 'Required').default('references'),
    samples_file: z
      .string()
      .min(1, 'Required')
      .regex(CSV, 'Must end in .csv')
      .default('config/samples.csv'),

    // ── Fusion library ────────────────────────────────────────────────────
    fusion_library: z.object({
      retained: z.object({
        name: z.string().min(1, 'Required'),
        position: z.enum(['5prime', '3prime']).default('3prime'),
        truncated_component: z.enum(['partner', 'retained']).default('retained'),
      }),
      linker_sequence: z.string().regex(DNA, 'ACGT only').default(''),
      partners_file: z.string().min(1, 'Required').regex(CSV, 'Must end in .csv'),
      sequences_file: z
        .string()
        .min(1, 'Required')
        .regex(FASTA, 'Must be a FASTA (.fasta, .fa, .fna)'),
      variant_retained: z.array(variantRetainedSchema).default([]),
      unfused_sequences_file: optionalCsv,
      exon_partners_file: optionalCsv,
    }),

    // ── Detection ─────────────────────────────────────────────────────────
    detection: z.object({
      method: z.enum(['string']).default('string'),
      breakpoint_window: z.number().int().min(5).max(50).default(12),
      maintain_frame: z.boolean().default(true),
      kmer_size: z.number().int().min(8).max(30).default(15),
      orientation_check: z.boolean().default(false),
      prefilter_fallback: z.boolean().default(false),
    }),

    // ── Sequencing ────────────────────────────────────────────────────────
    sequencing: z.object({
      paired: z.boolean().default(true),
      min_quality: z.number().int().min(0).max(42).default(30),
    }),

    // ── Preprocessing ─────────────────────────────────────────────────────
    preprocessing: z.object({
      adapters: z.string().default('resources/adapters.fa'),
      // Comma-separated in the UI; folded to a string[] on emit.
      contaminants: z
        .string()
        .default('resources/sequencing_artifacts.fa.gz,resources/phix174_ill.ref.fa.gz'),
    }),

    // ── QC ────────────────────────────────────────────────────────────────
    qc: z.object({
      run_qc: z.boolean().default(false),
      baseline_condition: z.string().default('baseline'),
      mem_fastqc: z.number().int().min(1000).default(4000),
    }),

    // ── Pipeline behaviour ────────────────────────────────────────────────
    pipeline: z.object({
      show_progress: z.boolean().default(true),
      progress_interval: z.number().int().min(1).max(50).default(1),
    }),

    // ── Resources ─────────────────────────────────────────────────────────
    resources: z.object({
      memory_mb: z.number().int().min(1000).default(16000),
      threads: z.number().int().min(1).max(128).default(16),
    }),

    // ── Quick mode (subsampling) ──────────────────────────────────────────
    quick: z.object({
      enabled: z.boolean().default(false),
      max_reads: z.number().int().min(1).default(100000),
      fraction: z.number().min(0).max(1).nullable().default(null),
      seed: z.number().int().default(1337),
    }),
  })
  .superRefine((data, ctx) => {
    data.fusion_library.variant_retained.forEach((v, i) => {
      const list = v.partners.split(',').map((s) => s.trim()).filter(Boolean)
      if (!v.all_partners && list.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fusion_library', 'variant_retained', i, 'partners'],
          message: 'List partner names or enable "all partners"',
        })
      }
    })
    if (
      data.quick.enabled &&
      data.quick.fraction !== null &&
      !(data.quick.fraction > 0 && data.quick.fraction <= 1)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quick', 'fraction'],
        message: 'Must be between 0 and 1',
      })
    }
  })

export type ConfigFormValues = z.infer<typeof configSchema>
export type VariantRetained = z.infer<typeof variantRetainedSchema>

// Plain defaults — not parsed through the schema so required-field constraints
// don't throw on initial empty values; React Hook Form validates on interaction.
export const configDefaults: ConfigFormValues = {
  experiment: '',
  data_dir: '',
  ref_dir: 'references',
  samples_file: 'config/samples.csv',
  fusion_library: {
    retained: { name: '', position: '3prime', truncated_component: 'retained' },
    linker_sequence: '',
    partners_file: '',
    sequences_file: '',
    variant_retained: [],
    unfused_sequences_file: '',
    exon_partners_file: '',
  },
  detection: {
    method: 'string',
    breakpoint_window: 12,
    maintain_frame: true,
    kmer_size: 15,
    orientation_check: false,
    prefilter_fallback: false,
  },
  sequencing: { paired: true, min_quality: 30 },
  preprocessing: {
    adapters: 'resources/adapters.fa',
    contaminants: 'resources/sequencing_artifacts.fa.gz,resources/phix174_ill.ref.fa.gz',
  },
  qc: { run_qc: false, baseline_condition: 'baseline', mem_fastqc: 4000 },
  pipeline: { show_progress: true, progress_interval: 1 },
  resources: { memory_mb: 16000, threads: 16 },
  quick: { enabled: false, max_reads: 100000, fraction: null, seed: 1337 },
}
