from fastapi import APIRouter
from pydantic import BaseModel

from app.models.config import ConfigPayload
from app.models.experiments import ExperimentsPayload
from app.services import validator

router = APIRouter()


class ValidationResponse(BaseModel):
    valid: bool
    errors: list[dict]


@router.post("/validate/config", response_model=ValidationResponse)
def validate_config(payload: ConfigPayload) -> ValidationResponse:
    errors = validator.validate_config(payload.model_dump(exclude_none=True))
    return ValidationResponse(valid=len(errors) == 0, errors=errors)


@router.post("/validate/experiments", response_model=ValidationResponse)
def validate_experiments(payload: ExperimentsPayload) -> ValidationResponse:
    rows = [r.model_dump(exclude_none=True) for r in payload.rows]
    errors = validator.validate_experiments(rows)
    return ValidationResponse(valid=len(errors) == 0, errors=errors)
