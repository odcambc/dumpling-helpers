"""
Liveness/version endpoint.

Reads the version from the backend's ``pyproject.toml`` so a single source
of truth (the project file) drives both packaging and runtime reporting.
"""

from __future__ import annotations

import tomllib
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/health", tags=["health"])

# app/routes/health.py -> app/routes -> app -> backend (which holds pyproject.toml)
_PYPROJECT_PATH = Path(__file__).resolve().parents[2] / "pyproject.toml"


@lru_cache(maxsize=1)
def _read_version() -> str:
    try:
        with _PYPROJECT_PATH.open("rb") as f:
            data = tomllib.load(f)
        return str(data["project"]["version"])
    except (OSError, KeyError, tomllib.TOMLDecodeError):
        return "unknown"


class HealthResponse(BaseModel):
    status: str
    version: str


@router.get("", response_model=HealthResponse)
def get_health() -> HealthResponse:
    return HealthResponse(status="ok", version=_read_version())
