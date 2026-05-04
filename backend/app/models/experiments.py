from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class SampleRow(BaseModel):
    sample: str
    condition: str
    replicate: int
    file: str
    time: Optional[float] = None
    bin: Optional[int] = None
    tile: Optional[int] = None


class ExperimentsPayload(BaseModel):
    mode: str  # "timecourse" | "facs"
    include_tile: bool = False
    rows: list[SampleRow]


class GeneratePayload(BaseModel):
    config: "ConfigPayload"
    experiments: ExperimentsPayload


from app.models.config import ConfigPayload  # noqa: E402 (avoid circular at top)

GeneratePayload.model_rebuild()
