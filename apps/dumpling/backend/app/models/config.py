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
    enrich2: bool = False
    remove_zeros: bool = False
    regenerate_variants: bool = False
    noprocess: bool = False
    run_qc: bool = True
    max_deletion_length: int = 3
    kmers: int = 15
    sam: str = "1.3"
    min_q: int = 30
    min_variant_obs: int = 3
    mem: int = 16
    mem_fastqc: int = 1024
    mem_rosace: int = 16000
    mem_lilace: int = 16000
    samtools_local: bool = False
    rosace_local: bool = False
    lilace_local: bool = False
    bbtools_use_bgzip: bool = True
    adapters: str | list[str] = Field(default_factory=list)
    contaminants: str | list[str] = Field(default_factory=list)
