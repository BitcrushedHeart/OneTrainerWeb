import os
import sys

# Add project root to path so modules/ is directly importable
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from web.backend.routers import concepts, config, health, presets, samples, secrets

app = FastAPI(
    title="OneTrainerWeb API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(config.router, prefix="/api")
app.include_router(presets.router, prefix="/api")
app.include_router(concepts.router, prefix="/api")
app.include_router(samples.router, prefix="/api")
app.include_router(secrets.router, prefix="/api")
