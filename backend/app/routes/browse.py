"""
Filesystem browsing — only mounted when DUMPLING_LOCAL=true.

Intentionally restricted to user-owned readable paths; does not follow
symlinks outside the start directory to avoid traversal surprises.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()

_VALID_EXTENSIONS = {
    ".fasta",
    ".fas",
    ".fa",
    ".fna",
    ".ffn",
    ".faa",
    ".mpfa",
    ".frn",
    ".csv",
    ".yaml",
    ".yml",
    ".gz",
}


class DirEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int | None = None


class BrowseResponse(BaseModel):
    current: str
    parent: str | None
    entries: list[DirEntry]


@router.get("/browse", response_model=BrowseResponse)
def browse(path: str = Query(default=str(Path.home()))) -> BrowseResponse:
    target = Path(path).expanduser().resolve()

    if not target.exists():
        raise HTTPException(status_code=404, detail="Path does not exist")
    if not os.access(target, os.R_OK):
        raise HTTPException(status_code=403, detail="Permission denied")

    if target.is_file():
        target = target.parent

    entries: list[DirEntry] = []
    try:
        for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if item.name.startswith("."):
                continue
            if item.is_file() and item.suffix.lower() not in _VALID_EXTENSIONS:
                continue
            size = item.stat().st_size if item.is_file() else None
            entries.append(
                DirEntry(name=item.name, path=str(item), is_dir=item.is_dir(), size=size)
            )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Permission denied") from exc

    parent = str(target.parent) if target != target.parent else None
    return BrowseResponse(current=str(target), parent=parent, entries=entries)
