import os
import shutil

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class CapabilitiesResponse(BaseModel):
    version: str
    filesystem_access: bool
    snakemake_available: bool


@router.get("/capabilities", response_model=CapabilitiesResponse)
def get_capabilities() -> CapabilitiesResponse:
    local_mode = os.getenv("DUMPLING_LOCAL", "false").lower() == "true"
    return CapabilitiesResponse(
        version="0.1.0",
        filesystem_access=local_mode,
        snakemake_available=local_mode and shutil.which("snakemake") is not None,
    )
