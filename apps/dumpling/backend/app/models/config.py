from __future__ import annotations

from pydantic import BaseModel, Field


class ConfigPayload(BaseModel):
    experiment: str
    experiment_file: str
    data_dir: str
    ref_dir: str
    reference: str
    orf: str
    variants_file: str = ""
    oligo_file: str = ""
    baseline_condition: str = ""
    scoring_backend: str = "rosace"
    aligner: str = "bbmap"
    enrich2: bool = True
    keep_enrich_h5: bool = False
    deposit_to_mavedb: bool = True
    run_cosmos: bool = False
    remove_zeros: bool = False
    regenerate_variants: bool = False
    noprocess: bool = False
    run_qc: bool = True
    max_deletion_length: int = 0
    kmers: int = 15
    sam: str = "1.3"
    min_q: int = 30
    min_variant_obs: int = 3
    lilace_seed: int | None = None
    mem: int = 16
    mem_fastqc: int = 1024
    mem_rosace: int = 16000
    mem_rosace_aa: int = 16000
    mem_lilace: int = 16000
    mem_bbduk: int = 2000
    mem_bbmerge: int = 2000
    mem_bbmap: int = 12000
    mem_minimap2: int = 1000
    mem_gatk: int = 6000
    mem_process_sample: int = 2000
    mem_cosmos: int = 4000
    samtools_local: bool = False
    rosace_local: bool = False
    lilace_local: bool = False
    rosace_aa_local: bool = False
    bbtools_compression: str = "pigz"
    adapters: str | list[str] = Field(default_factory=list)
    contaminants: str | list[str] = Field(default_factory=list)
