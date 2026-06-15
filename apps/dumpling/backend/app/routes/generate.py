from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.models.experiments import GeneratePayload
from app.services import generator, validator

router = APIRouter(prefix="/generate", tags=["generate"])


@router.post("")
def generate_files(payload: GeneratePayload) -> Response:
    config_errors = validator.validate_config(payload.config.model_dump(exclude_none=True))
    experiment_rows = [r.model_dump(exclude_none=True) for r in payload.experiments.rows]
    exp_errors = validator.validate_experiments(experiment_rows)

    if config_errors or exp_errors:
        raise HTTPException(
            status_code=422,
            detail={"config_errors": config_errors, "experiment_errors": exp_errors},
        )

    zip_bytes = generator.generate_zip(payload.config, payload.experiments)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="dumpling-config.zip"'},
    )
