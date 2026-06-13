# File contracts

This document is the authoritative reference for the CSV/YAML files that move
between tools in the dumpling-helpers suite. Anyone building a new tool that
reads or writes one of these files should match the format described here so it
interoperates with the rest of the toolchain.

Each section lists:

- **Purpose** — what the file is for.
- **Producer** — the tool(s) that create it.
- **Consumer** — the tool(s) that read it.
- **Required columns / keys** — name, type, and meaning.
- **Optional columns / keys** — name, type, default, and meaning.
- **Example** — three rows or a representative snippet.

The schemas of record are linked at the end of each section. When this doc
disagrees with the schema, the schema wins — please open a PR to fix the doc.

---

## 1. `config.yaml`

### Purpose

Top-level configuration for a Snakemake DMS pipeline run. Drives sample
discovery, reference loading, scoring backend, resource budgets, and the
location of the experiments CSV and the designed variants / oligo files.

### Producer

- `frontend` (the wizard UI) emits `config.yaml` as part of the generated
  config bundle (`<experiment>-config.zip`), built from the form values in
  `App.tsx` via `js-yaml`.

### Consumer

- The Snakemake DMS pipeline (external to this repo).
- The `Preview` and `ImportButton` components in the frontend (round-trip
  edit / re-import).
- The backend `/api/validate/config` endpoint.

### Required keys

| key                 | type                                            | meaning                                                                  |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `experiment`        | string (non-empty)                              | Experiment name used as the run / output prefix.                         |
| `experiment_file`   | string (non-empty)                              | Path to `experiments.csv` (see section 2), relative to the Snakemake root. |
| `data_dir`          | string (non-empty)                              | Directory containing FASTQ reads.                                        |
| `ref_dir`           | string (non-empty)                              | Directory containing reference FASTA files.                              |
| `reference`         | string ending in `.fasta` / `.fa` / `.fna` / `.ffn` / `.faa` / `.mpfa` / `.frn` / `.fas` | Reference FASTA file name (under `ref_dir`).                             |
| `orf`               | string matching `^\d+-\d+$` (e.g. `141-1568`)   | ORF coordinates in the reference, 1-based start–stop.                    |

### Conditionally required

| key             | type   | when required                                                                  |
| --------------- | ------ | ------------------------------------------------------------------------------ |
| `variants_file` | string | When `regenerate_variants` is `false` (the default). Path to designed variants CSV. |
| `oligo_file`    | string | When `regenerate_variants` is `true`. Path to DIMPLE-format oligo CSV.         |

### Optional keys (with defaults)

| key                   | type                              | default                                                                          | meaning                                                                  |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `baseline_condition`  | string                            | `""`                                                                             | Condition name to use as the differential-expression baseline.           |
| `regenerate_variants` | boolean                           | `false`                                                                          | Regenerate the designed-variants file from `oligo_file` at runtime.      |
| `scoring_backend`     | enum: `rosace` \| `lilace`        | `rosace`                                                                         | Scoring backend.                                                         |
| `enrich2`             | boolean                           | `false`                                                                          | Also run Enrich2.                                                        |
| `remove_zeros`        | boolean                           | `false`                                                                          | (Enrich2 only) drop unobserved / zero-count variants.                    |
| `run_qc`              | boolean                           | `true`                                                                           | Run QC stages.                                                           |
| `noprocess`           | boolean                           | `false`                                                                          | Skip filtering of called variants against the designed list.            |
| `max_deletion_length` | integer ≥ 1                       | `3`                                                                              | Max designed deletion length (codons).                                   |
| `kmers`               | integer ≥ 1                       | `15`                                                                             | k-mer length for bbduk.                                                  |
| `sam`                 | enum: `1.3` \| `1.4`              | `1.3`                                                                            | bbmap CIGAR version.                                                     |
| `min_q`               | integer in `[0, 60]`              | `30`                                                                             | Min base quality for GATK ASM.                                           |
| `min_variant_obs`     | integer ≥ 1                       | `3`                                                                              | Min observation count for GATK ASM to keep a variant.                    |
| `mem`                 | integer ≥ 1                       | `16`                                                                             | bbtools memory (GB).                                                     |
| `mem_fastqc`          | integer ≥ 256                     | `1024`                                                                           | FastQC memory (MB).                                                      |
| `mem_rosace`          | integer ≥ 1000                    | `16000`                                                                          | Rosace memory (MB).                                                      |
| `mem_lilace`          | integer ≥ 1000                    | `16000`                                                                          | Lilace memory (MB).                                                      |
| `samtools_local`      | boolean                           | `false`                                                                          | Use system `samtools` instead of the wrapper.                            |
| `rosace_local`        | boolean                           | `false`                                                                          | Use system R for ROSACE instead of conda.                                |
| `lilace_local`        | boolean                           | `false`                                                                          | Use system Lilace install instead of conda.                              |
| `bbtools_use_bgzip`   | boolean                           | `true`                                                                           | Use bgzip in BBTools (set false to fall back to pigz).                   |
| `adapters`            | string \| string[]                | `resources/adapters.fa`                                                          | Adapter file(s) for bbduk. Frontend stores a comma-separated string; the YAML emitter converts to an array of length ≥ 2 and a bare string for length 1. |
| `contaminants`        | string \| string[]                | `resources/sequencing_artifacts.fa.gz,resources/phix174_ill.ref.fa.gz`           | Contaminant file(s) for bbduk. Same array/string convention as `adapters`. |

### Example

```yaml
# Generated by dumpling-helpers
experiment: ABCG2_DMS
experiment_file: config/experiments/ABCG2.csv
baseline_condition: DMSO
data_dir: data/abcg2/fastq
ref_dir: references
reference: ABCG2_ref.fasta
orf: 141-2099
variants_file: config/designed_variants/abcg2.csv
regenerate_variants: false
scoring_backend: rosace
enrich2: false
run_qc: true
noprocess: false
max_deletion_length: 3
kmers: 15
sam: '1.3'
min_q: 30
min_variant_obs: 3
mem: 16
mem_fastqc: 1024
mem_rosace: 16000
mem_lilace: 16000
samtools_local: false
rosace_local: false
lilace_local: false
bbtools_use_bgzip: true
adapters: resources/adapters.fa
contaminants:
  - resources/sequencing_artifacts.fa.gz
  - resources/phix174_ill.ref.fa.gz
```

### Schemas of record

- Frontend (Zod): `frontend/src/schemas/config.ts` — `configSchema`.
- Backend (JSON Schema): `backend/app/schemas/config.schema.yaml`.
- Backend (Pydantic): `backend/app/models/config.py` — `ConfigPayload`.

### Notes

- Cross-field rule (frontend-only, enforced in `superRefine`): exactly one of
  `oligo_file` (when `regenerate_variants: true`) or `variants_file` (when
  `regenerate_variants: false`) must be set. The backend JSON Schema does not
  encode this rule.
- Unknown keys are silently dropped with a warning by the frontend importer
  (`importConfigYaml` in `frontend/src/lib/importers.ts`); other consumers may
  treat them as errors.
- The frontend always wraps the YAML output with the leading line
  `# Generated by dumpling-helpers`.

---

## 2. `experiments.csv`

### Purpose

Sample sheet mapping each FASTQ file to a sample name, condition, replicate,
and either a time-point (timecourse experiments) or a sort bin (FACS
experiments). Optionally tags each row with a tile number.

### Producer

- `frontend` (the wizard `SampleTable`) emits this CSV via PapaParse from
  `App.tsx`. The path is recorded in `config.yaml`'s `experiment_file`.

### Consumer

- The Snakemake DMS pipeline.
- The frontend importer (`importExperimentsCsv` in
  `frontend/src/lib/importers.ts`) for round-trip edits.
- The backend `/api/validate/experiments` endpoint.

### Required columns

All required columns must be present and non-empty in every row.

| column      | type                                  | meaning                                                                  |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `sample`    | string (non-empty, unique per file)   | Sample identifier. Must be unique within the file.                       |
| `condition` | string (non-empty)                    | Experimental condition (e.g. `DMSO`, `drug_10uM`, `bin1`).               |
| `replicate` | integer ≥ 1                           | Replicate number within `(condition, time-or-bin)`.                      |
| `file`      | string (non-empty)                    | FASTQ file path (or basename relative to `data_dir`).                    |

### Mode-defining columns (exactly one)

The presence of `time` vs. `bin` selects the experiment **mode**. Producers
must include exactly one of them; consumers should treat the file as
timecourse if `time` is present, FACS if only `bin` is present, and warn /
default to timecourse otherwise.

| column | type    | mode         | meaning                                              |
| ------ | ------- | ------------ | ---------------------------------------------------- |
| `time` | float   | `timecourse` | Time-point (any units, but consistent within a run). |
| `bin`  | integer | `facs`       | Sort bin index (≥ 1).                                |

If both columns are present, the importer warns and treats the file as
timecourse (uses `time`).

### Optional columns

| column | type        | default | meaning                                                                    |
| ------ | ----------- | ------- | -------------------------------------------------------------------------- |
| `tile` | integer ≥ 1 | absent  | Tile / sub-region index for tiled libraries. Must be present for all rows or none. |

### Examples

**Timecourse (3 rows):**

```csv
sample,condition,replicate,time,file
abcg2_dmso_r1_t0,DMSO,1,0,abcg2_dmso_r1_t0.fastq.gz
abcg2_dmso_r1_t1,DMSO,1,1,abcg2_dmso_r1_t1.fastq.gz
abcg2_drug_r1_t1,drug_10uM,1,1,abcg2_drug_r1_t1.fastq.gz
```

**FACS with tiles (3 rows):**

```csv
sample,condition,replicate,bin,tile,file
slco1b1_b1_r1_tile1,sort,1,1,1,slco1b1_b1_r1_t1.fastq.gz
slco1b1_b2_r1_tile1,sort,1,2,1,slco1b1_b2_r1_t1.fastq.gz
slco1b1_b1_r1_tile2,sort,1,1,2,slco1b1_b1_r1_t2.fastq.gz
```

### Schemas of record

- Frontend (Zod, single row): `frontend/src/schemas/experiments.ts` —
  `sampleRowSchema`, `validateSampleTable`.
- Frontend (importer): `frontend/src/lib/importers.ts` —
  `importExperimentsCsv`.
- Backend (Pydantic): `backend/app/models/experiments.py` — `SampleRow`.

### Notes

- The frontend's in-memory row shape uses `timeOrBin: number` to fold both
  modes into one field; on disk, the column is named `time` or `bin`
  (chosen by `mode`).
- `validateSampleTable` enforces uniqueness of `sample` within the file.
- The CSV is written with `\n` line endings (PapaParse `unparse({ newline: '\n' })`).

---

## 3. Oligo CSV (DIMPLE-format)

### Purpose

The library design as a flat list of `(id, sequence)` pairs. Each row is one
synthesised oligo, with the variant it was designed to encode embedded in the
ID. Used both as the input to the Snakemake pipeline (when
`regenerate_variants: true`) and as the input to the OligoValidator.

### Producer

- DIMPLE (external).
- Any oligo-design tool that follows the DIMPLE ID conventions below.

### Consumer

- The Snakemake DMS pipeline (when `regenerate_variants: true`, via
  `oligo_file`).
- `OligoValidator` in the frontend
  (`frontend/src/components/OligoValidator/OligoValidator.tsx`).

### Format

- Plain CSV, **no header row**.
- UTF-8; a leading BOM (`U+FEFF`) is tolerated.
- Two columns per row:

  | column index | name       | type                          | meaning                                            |
  | ------------ | ---------- | ----------------------------- | -------------------------------------------------- |
  | 0            | `id`       | string (non-empty)            | Oligo identifier; the variant claim is parsed from this. |
  | 1            | `sequence` | string of `ACGT` (any case)   | Oligo nucleotide sequence (may include 5'/3' adapters). |

- Empty / blank lines and rows missing either field are skipped silently.
- The parser splits on the **first** comma only — embedded commas in
  `sequence` are not expected and would corrupt the row.

### ID conventions (variant claim parsed from `id`)

The OligoValidator parses the suffix of each `id` to recover what the oligo
claims to encode. Anything before the suffix is free-form (typically a gene
or library tag, e.g. `ABCG2_DMS-1_`). Recognised suffixes:

| pattern (regex tail of `id`)                    | claim type                                | example                       |
| ----------------------------------------------- | ----------------------------------------- | ----------------------------- |
| `_<Xxx><pos><Yyy>` (3-letter AA codes)          | Substitution `X<pos>Y` (or synonymous if `X==Y`) | `..._Ser2Cys`            |
| `_(delete\|del)-<n>_<L>-<pos>` (case-insensitive) | Deletion of length `L` codons at AA position `pos` (`n` is a design-time index) | `..._delete-1_3-10` |
| `_(insert\|ins)-<n>_<L>-<pos>`                  | Insertion of length `L` codons at AA position `pos`, sequence unspecified  | `..._insert-2_1-42` |
| `_(insert\|ins)-<n>_<ACGT…>-<pos>`              | Insertion of an explicit nucleotide sequence at AA position `pos` (length = `len(seq)`) | `..._insert-1_GGC-2` |

Oligos whose ID does not match any of these patterns are still validated by
alignment to the CDS; with no parsed claim to compare against, they appear with
an empty `claimed` column and status `pass_unclaimed` (or `warn_no_change` /
`fail_alignment`) in the validation report.

### Example

```csv
ABCG2_DMS-1_Ser2Cys,ACATTAAATTTCGCCGTGGCAGACTGCGGTCTCCCACCATGTGCTCCAGTAATGTCGAAGTTTTTATCCCAGTGTCACAAGGAAACACCAATGGCTTC
ABCG2_DMS-1_Ser2Asp,ACATTAAATTTCGCCGTGGCAGACTGCGGTCTCCCACCATGGACTCCAGTAATGTCGAAGTTTTTATCCCAGTGTCACAAGGAAACACCAATGGCTTC
Kir21_delete-1_3-10,AAGACTCAACCAATGACCCTTCCCGGCATTGGTCTCCCTCACCATGGGatcAGTGCGAACCAATCGGTATATCGTATCAAGCGAGGAGGACGGGATGAAA
```

### Schemas of record

- Parser: `frontend/src/components/OligoValidator/OligoValidator.tsx` —
  `parseOligoCsv`.
- ID parsers: `frontend/src/lib/oligoAlignment.ts` —
  `parseClaimedMutation`, `parseClaimedIndel`.

### Notes

- Mixed-case sequences are accepted; the validator upper-cases internally.
- The 5' / 3' adapter regions of the oligo do not need to match the
  reference — the validator infers the CDS-overlapping window via k-mer
  voting (k = 15) and only validates inside that window.

---

## 4. `designed_variants.csv`

### Purpose

Per-variant manifest used by the Snakemake DMS pipeline as the canonical list
of designed variants to count. Produced from an oligo CSV (section 3) by
DIMPLE or by the pipeline itself when `regenerate_variants: true`.

### Producer

- DIMPLE (external).
- The Snakemake DMS pipeline, when `regenerate_variants: true` in
  `config.yaml`.

### Consumer

- The Snakemake DMS pipeline (variant calling and scoring stages).
- Indirectly described by `frontend/src/components/wizard/StepPaths.tsx`,
  which prompts the user for this file's path when `regenerate_variants` is
  off.

### Required columns

The frontend wizard documents the column set as
`count, pos, mutation_type, name, codon, mutation, length, hgvs`. All columns
are required for every row.

| column          | type    | meaning                                                                              |
| --------------- | ------- | ------------------------------------------------------------------------------------ |
| `count`         | integer | Number of oligos / synonymous variants designed for this entry (≥ 1).                |
| `pos`           | integer | Variant position. For substitutions: the AA position (1-based). For indels: the AA position before the event. |
| `mutation_type` | string  | One of `sub` / `del` / `ins` (or pipeline-equivalent labels).                        |
| `name`          | string  | Human-readable variant name (typically the trailing portion of the oligo ID, e.g. `Ser2Cys`, `delete-1_3-10`). |
| `codon`         | string  | Codon used to encode the variant at `pos`. For substitutions: the mutant codon. For deletions: empty / `-`. |
| `mutation`      | string  | Short mutation summary (e.g. `S2C`, `del:3@10`, `ins:GGC@2`).                        |
| `length`        | integer | For indels: length in codons. For substitutions: `1`.                                |
| `hgvs`          | string  | HGVS-style description of the variant (typically protein-level, e.g. `p.Ser2Cys`).   |

### Example

```csv
count,pos,mutation_type,name,codon,mutation,length,hgvs
1,2,sub,Ser2Cys,TGC,S2C,1,p.Ser2Cys
1,2,sub,Ser2Asp,GAC,S2D,1,p.Ser2Asp
1,10,del,delete-1_3-10,,del:3@10,3,p.Asn10_Ser12del
```

### Schemas of record

- This format is **not validated by code in this repository** — only its
  path is collected (`variants_file` in `config.yaml`). The column list is
  documented in `frontend/src/components/wizard/StepPaths.tsx` (the
  description prop of the `Designed variants file` field). Treat the
  Snakemake pipeline as the source of truth for column semantics and HGVS
  conventions.

### Notes

- New tools that emit this format should match DIMPLE's output exactly so
  the Snakemake pipeline can consume it without modification.
- If you need to validate a `designed_variants.csv` programmatically, add a
  parser+validator under `frontend/src/lib/` or `backend/app/services/` and
  link it from this section.

---

## 5. OligoValidator report CSV

### Purpose

Per-oligo validation report emitted as a download from the OligoValidator
page. One row per input oligo, recording the variant the oligo was
*claimed* to encode (parsed from the ID), the variant the oligo *actually*
encodes (recovered by alignment to the reference CDS), and any problems
flagged.

### Producer

- `OligoValidator` in the frontend
  (`frontend/src/components/OligoValidator/OligoValidator.tsx` —
  `downloadReport`).

### Consumer

- Humans (QC), and any downstream tool that wants to filter the input oligo
  CSV by validation status before passing it to the pipeline.

### Format

- Plain CSV, **with a header row**.
- Every cell is double-quoted; embedded `"` is escaped as `""`.
- Filename: `<reference-header>-oligo-validation.csv` (whitespace replaced
  with `_`).

The report is the output of **sequence-based detection**: the oligo is aligned
to the CDS (k-mer vote → adapter strip → banded affine-gap alignment), the
alignment is walked into classified changes, and those are compared
best-effort against the claim parsed from the ID. The single `detected` column
carries the recovered change(s); `status` records how detection compared to
the claim.

### Columns (all present, in this order)

| column             | type                                                                                      | meaning                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`               | string                                                                                    | The oligo ID (column 0 of the input CSV).                                                                                     |
| `status`           | enum: `pass` \| `pass_unclaimed` \| `warn_mismatch` \| `warn_no_change` \| `fail_alignment` | Overall result (see "Status values" below).                                                                                   |
| `detected`         | string                                                                                    | Human-readable summary of the change(s) recovered by alignment, or `no change` if none. Multiple changes are joined by `; `.  |
| `claimed`          | string (may be empty)                                                                     | Variant parsed from the ID: a substitution as `<wt><pos><mut>` (single-letter, e.g. `S2C`) or an indel as `<type>@<pos>` (e.g. `deletion@10`). Empty when the ID has no parseable claim. |
| `cds_align_pos`    | integer (may be empty)                                                                    | 0-based CDS offset where oligo position 0 aligns (may be negative if a 5' adapter precedes the CDS). Empty if alignment failed. |
| `align_confidence` | float in `[0, 1]`                                                                         | k-mer vote confidence in the placement, to 2 decimals (e.g. `0.98`).                                                          |
| `problems`         | string (may be empty)                                                                     | Pipe-separated (` \| `) human-readable issues; populated mainly for `warn_*` / `fail_*` rows.                                 |

#### `detected` change grammar

Each change is one of:

- **substitution** — `<wtAA><aaPos><mutAA> (<refNt>><altNt>)`, e.g. `S2C (AGC>TGC)`.
- **deletion** — `<n> nt deleted (<k> codon(s), in-frame) at AA <pos>` when
  in-frame, or `<n> nt deleted (frameshift) at AA <pos>` otherwise.
- **insertion** — same as deletion with `inserted` in place of `deleted`.

Indels are always reported primarily in nucleotides, with the codon count
secondary — this is deliberate (a 1-nt deletion is a frameshift, not "0 codons").

#### Status values

| status           | meaning                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `pass`           | Detected change matches the ID claim, with no off-target changes.                                      |
| `pass_unclaimed` | Change(s) detected, but the ID has no parseable claim to compare against.                              |
| `warn_mismatch`  | Detected change differs from the claim (wrong residue, wrong position, wrong inserted bases, or extra off-target changes). |
| `warn_no_change` | Oligo matches the CDS in the aligned window — no change at all (likely a synthesis failure or WT oligo). |
| `fail_alignment` | The oligo could not be placed reliably in the CDS.                                                     |

### Example

```csv
id,status,detected,claimed,cds_align_pos,align_confidence,problems
"ABCG2_DMS-1_Ser2Cys","pass","S2C (AGC>TGC)","S2C",-37,"0.98",""
"ABCG2_DMS-1_Ser2Ser","warn_no_change","no change","S2S",-37,"0.98","No sequence change vs CDS — likely synthesis failure or a wild-type oligo"
"Kir21_delete-1_3-10","pass","3 nt deleted (1 codon, in-frame) at AA 10","deletion@10",-30,"0.97",""
```

### Schemas of record

- Producer: `frontend/src/components/OligoValidator/OligoValidator.tsx` —
  `downloadReport` (header definition and row layout).
- Detection + change-formatting logic: `frontend/src/lib/oligoAlignment.ts` —
  `detectVariant` (status), `describeDiffs` / `describeDiff` (the `detected`
  column).
- This format has no consumer in this repository — there is no parser; it is
  intended as a human-readable QC artifact.

### Notes

- This is a redesigned report (sequence-based detection). It replaces an
  earlier claim-verification report whose per-change columns (`change_type`,
  `cds_nt_pos`, `aa_pos`, `ref_bases`, `oligo_bases`, `wt_aa`, `mut_aa`,
  `frameshift`, `claimed_indel`) are now folded into the single human-readable
  `detected` column.
- Type IIS (BsaI / BsmBI) recognition sites introduced by the oligo are
  surfaced as an informational badge in the UI but are **not** included in this
  CSV and do **not** affect `status` (see `scanTypeIISites` in
  `frontend/src/lib/oligoAlignment.ts`).

---

## Appendix: relationships at a glance

```
              ┌────────────────────────┐
DIMPLE  ───►  │   oligo CSV (§3)       │  ──►  OligoValidator
              │   id,sequence          │       └─►  validation report (§5)
              └──────────┬─────────────┘
                         │ regenerate_variants: true
                         ▼ (in pipeline)
              ┌────────────────────────┐
              │ designed_variants (§4) │  ──►  Snakemake DMS pipeline
              │ count,pos,…,hgvs       │
              └────────────────────────┘
                         ▲
                         │ variants_file
                         │
              ┌──────────┴─────────────┐         ┌─────────────────────────┐
Wizard  ───►  │   config.yaml (§1)     │ ◄──── │   experiments.csv (§2)  │ ◄── Wizard
              │   experiment_file ─────┼────►   │   sample,condition,…    │
              └────────────────────────┘         └─────────────────────────┘
```
