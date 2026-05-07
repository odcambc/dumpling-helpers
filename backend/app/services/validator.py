"""
Schema validation for config and experiments payloads.

We load the pipeline's own JSON schemas (bundled at deploy time) and run them
through jsonschema, producing structured error lists rather than raw exceptions.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

SCHEMA_DIR = Path(__file__).parent.parent / "schemas"


def _load_schema(name: str) -> dict:
    path = SCHEMA_DIR / name
    with path.open() as f:
        return yaml.safe_load(f)


# Schemas are process-scoped singletons — no need to re-read on every request.
_CONFIG_SCHEMA = _load_schema("config.schema.yaml")
_EXPERIMENTS_SCHEMA = _load_schema("experiments.schema.yaml")


def _format_errors(errors: list) -> list[dict]:
    return [
        {
            "path": " → ".join(str(p) for p in e.absolute_path) or "(root)",
            "message": e.message,
        }
        for e in errors
    ]


def validate_config(data: dict) -> list[dict]:
    """
    Validate a config dict against config.schema.yaml.
    Returns a list of {path, message} dicts; empty means valid.
    """
    validator = Draft202012Validator(_CONFIG_SCHEMA)
    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    return _format_errors(errors)


def validate_experiments(rows: list[dict]) -> list[dict]:
    """
    Validate each experiment row against experiments.schema.yaml.
    Returns a combined list of errors with row indices.
    """
    validator = Draft202012Validator(_EXPERIMENTS_SCHEMA)
    all_errors: list[dict] = []
    for i, row in enumerate(rows):
        for error in validator.iter_errors(row):
            path = " → ".join(str(p) for p in error.absolute_path) or "(root)"
            all_errors.append({"row": i, "path": path, "message": error.message})
    return all_errors
