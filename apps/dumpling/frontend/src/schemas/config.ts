import { z } from 'zod'

const VALID_REF_EXTENSIONS = /\.(fasta|fas|fa|fna|ffn|faa|mpfa|frn)$/i
const ORF_PATTERN = /^\d+-\d+$/

export const configSchema = z
  .object({
    // Step 1
    experiment: z.string().min(1, 'Required'),
    experiment_file: z.string().min(1, 'Required'),
    baseline_condition: z.string().default(''),

    // Step 2
    data_dir: z.string().min(1, 'Required'),
    ref_dir: z.string().min(1, 'Required'),
    reference: z
      .string()
      .min(1, 'Required')
      .regex(VALID_REF_EXTENSIONS, 'Must be a FASTA file (.fasta, .fa, .fna, …)'),
    orf: z
      .string()
      .min(1, 'Required')
      .regex(ORF_PATTERN, 'Format: start-stop (e.g. 141-1568)'),
    variants_file: z.string().default(''),
    regenerate_variants: z.boolean().default(false),
    oligo_file: z.string().default(''),

    // Step 3 — pipeline options
    scoring_backend: z.enum(['rosace', 'lilace', 'rosace_aa']).default('rosace'),
    aligner: z.enum(['bbmap', 'minimap2']).default('bbmap'),
    enrich2: z.boolean().default(true),
    keep_enrich_h5: z.boolean().default(false),
    deposit_to_mavedb: z.boolean().default(true),
    run_cosmos: z.boolean().default(false),
    remove_zeros: z.boolean().default(false),
    run_qc: z.boolean().default(true),
    noprocess: z.boolean().default(false),

    // Advanced
    max_deletion_length: z.number().int().min(0).default(0),
    kmers: z.number().int().min(1).default(15),
    sam: z.enum(['1.3', '1.4']).default('1.3'),
    min_q: z.number().int().min(0).max(60).default(30),
    min_variant_obs: z.number().int().min(1).default(3),
    // null means lilace derives a fresh seed at run time (and logs it); set an
    // integer to make the lilace Stan chain init bit-identical across runs.
    lilace_seed: z.number().int().nullable().default(null),

    // Memory (per-rule allocations, in Mb unless noted)
    mem: z.number().int().min(1).default(16), // bbtools, in Gb
    mem_fastqc: z.number().int().min(256).default(1024),
    mem_rosace: z.number().int().min(1000).default(16000),
    mem_rosace_aa: z.number().int().min(1000).default(16000),
    mem_lilace: z.number().int().min(1000).default(16000),
    mem_bbduk: z.number().int().min(256).default(2000),
    mem_bbmerge: z.number().int().min(256).default(2000),
    mem_bbmap: z.number().int().min(1000).default(12000),
    mem_minimap2: z.number().int().min(256).default(1000),
    mem_gatk: z.number().int().min(1000).default(6000),
    mem_process_sample: z.number().int().min(256).default(2000),
    mem_cosmos: z.number().int().min(256).default(4000),

    // Environment
    samtools_local: z.boolean().default(false),
    rosace_local: z.boolean().default(false),
    lilace_local: z.boolean().default(false),
    rosace_aa_local: z.boolean().default(false),
    bbtools_compression: z.enum(['pigz', 'bgzip', 'none']).default('pigz'),

    // Resources
    adapters: z.string().default('resources/adapters.fa'),
    contaminants: z.string().default(
      'resources/sequencing_artifacts.fa.gz,resources/phix174_ill.ref.fa.gz',
    ),
  })
  .superRefine((data, ctx) => {
    if (data.regenerate_variants && !data.oligo_file) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['oligo_file'],
        message: 'Required when "Regenerate variants from oligo file" is enabled',
      })
    }
    if (!data.regenerate_variants && !data.variants_file) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants_file'],
        message: 'Required unless regenerating variants from an oligo file',
      })
    }
    // lilace and rosace_aa need parsed variant metadata, so they are
    // incompatible with noprocess (mirrors upstream validate_scoring_backend_mode).
    if (data.noprocess && data.scoring_backend !== 'rosace') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scoring_backend'],
        message:
          'lilace and rosace_aa require processed variants — turn off "noprocess" or use rosace',
      })
    }
  })

export type ConfigFormValues = z.infer<typeof configSchema>

// Plain defaults — not parsed through the schema so required-field constraints
// don't throw on initial empty values; React Hook Form validates on interaction.
export const configDefaults: ConfigFormValues = {
  experiment: '',
  experiment_file: '',
  baseline_condition: '',
  data_dir: '',
  ref_dir: 'references',
  reference: '',
  orf: '',
  variants_file: '',
  regenerate_variants: false,
  oligo_file: '',
  scoring_backend: 'rosace',
  aligner: 'bbmap',
  enrich2: true,
  keep_enrich_h5: false,
  deposit_to_mavedb: true,
  run_cosmos: false,
  remove_zeros: false,
  run_qc: true,
  noprocess: false,
  max_deletion_length: 0,
  kmers: 15,
  sam: '1.3',
  min_q: 30,
  min_variant_obs: 3,
  lilace_seed: null,
  mem: 16,
  mem_fastqc: 1024,
  mem_rosace: 16000,
  mem_rosace_aa: 16000,
  mem_lilace: 16000,
  mem_bbduk: 2000,
  mem_bbmerge: 2000,
  mem_bbmap: 12000,
  mem_minimap2: 1000,
  mem_gatk: 6000,
  mem_process_sample: 2000,
  mem_cosmos: 4000,
  samtools_local: false,
  rosace_local: false,
  lilace_local: false,
  rosace_aa_local: false,
  bbtools_compression: 'pigz',
  adapters: 'resources/adapters.fa',
  contaminants: 'resources/sequencing_artifacts.fa.gz,resources/phix174_ill.ref.fa.gz',
}
