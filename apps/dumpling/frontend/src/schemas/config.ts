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
    scoring_backend: z.enum(['rosace', 'lilace']).default('rosace'),
    enrich2: z.boolean().default(false),
    remove_zeros: z.boolean().default(false),
    run_qc: z.boolean().default(true),
    noprocess: z.boolean().default(false),

    // Advanced
    max_deletion_length: z.number().int().min(1).default(3),
    kmers: z.number().int().min(1).default(15),
    sam: z.enum(['1.3', '1.4']).default('1.3'),
    min_q: z.number().int().min(0).max(60).default(30),
    min_variant_obs: z.number().int().min(1).default(3),
    mem: z.number().int().min(1).default(16),
    mem_fastqc: z.number().int().min(256).default(1024),
    mem_rosace: z.number().int().min(1000).default(16000),
    mem_lilace: z.number().int().min(1000).default(16000),

    // Environment
    samtools_local: z.boolean().default(false),
    rosace_local: z.boolean().default(false),
    lilace_local: z.boolean().default(false),
    bbtools_use_bgzip: z.boolean().default(true),

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
  enrich2: false,
  remove_zeros: false,
  run_qc: true,
  noprocess: false,
  max_deletion_length: 3,
  kmers: 15,
  sam: '1.3',
  min_q: 30,
  min_variant_obs: 3,
  mem: 16,
  mem_fastqc: 1024,
  mem_rosace: 16000,
  mem_lilace: 16000,
  samtools_local: false,
  rosace_local: false,
  lilace_local: false,
  bbtools_use_bgzip: true,
  adapters: 'resources/adapters.fa',
  contaminants: 'resources/sequencing_artifacts.fa.gz,resources/phix174_ill.ref.fa.gz',
}
