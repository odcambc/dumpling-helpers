import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import browse, capabilities, discover, generate, validate

LOCAL_MODE = os.getenv("DUMPLING_LOCAL", "false").lower() == "true"

app = FastAPI(
    title="dumpling-helpers API",
    description="Configuration helper for the dumpling DMS Snakemake pipeline",
    version="0.1.0",
)

# In production the frontend is served from the same origin; allow all in dev.
origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(capabilities.router, prefix="/api")
app.include_router(validate.router, prefix="/api")
app.include_router(generate.router, prefix="/api")

if LOCAL_MODE:
    app.include_router(browse.router, prefix="/api")
    app.include_router(discover.router, prefix="/api")
