from __future__ import annotations

from pydantic import BaseModel


class SampleRow(BaseModel):
    sample: str
    condition: str
    replicate: int
    file: str
    time: float | None = None
    bin: int | None = None
    tile: int | None = None


class ExperimentsPayload(BaseModel):
    mode: str  # "timecourse" | "facs"
    include_tile: bool = False
    rows: list[SampleRow]


class GeneratePayload(BaseModel):
    config: ConfigPayload
    experiments: ExperimentsPayload


from app.models.config import ConfigPayload  # noqa: E402 (avoid circular at top)

GeneratePayload.model_rebuild()
