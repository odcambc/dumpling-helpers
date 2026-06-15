r"""
FASTQ file discovery — only mounted when DUMPLING_LOCAL=true.

Scans a data directory for FASTQ files and returns the file prefixes
(the part before the R1/R2 suffix) that the dumpling pipeline expects in
the `file` column of the experiments CSV.

Filename patterns matched (from dumpling/workflow/rules/common.smk):
    [._](?:R1|1)(?:_\d+)?\.(?:fastq|fq)(?:\.gz)?$
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/discover", tags=["discover"])

# R1 pattern from the pipeline's common.smk — strip this suffix to get the prefix.
_R1_SUFFIX = re.compile(r"[._](?:R1|1)(?:_\d+)?\.(?:fastq|fq)(?:\.gz)?$", re.IGNORECASE)


class DiscoverResponse(BaseModel):
    data_dir: str
    prefixes: list[str]


@router.get("", response_model=DiscoverResponse)
def discover_fastq(
    data_dir: str = Query(..., description="Absolute or relative path to FASTQ data directory"),
) -> DiscoverResponse:
    target = Path(data_dir).expanduser().resolve()

    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Directory not found: {data_dir}")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {data_dir}")
    if not os.access(target, os.R_OK):
        raise HTTPException(status_code=403, detail="Permission denied")

    prefixes: set[str] = set()
    try:
        for item in target.iterdir():
            if item.is_file() and _R1_SUFFIX.search(item.name):
                prefix = _R1_SUFFIX.sub("", item.name)
                prefixes.add(prefix)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Permission denied reading directory") from exc

    return DiscoverResponse(data_dir=str(target), prefixes=sorted(prefixes))
