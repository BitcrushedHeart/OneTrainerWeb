import sys

from web.backend.paths import PROJECT_ROOT

# Add project root to path so modules/ is directly importable
sys.path.insert(0, PROJECT_ROOT)

from web.backend.routers import (
    concepts,
    config,
    converter,
    health,
    presets,
    samples,
    sampling,
    secrets,
    system,
    tensorboard,
    tools,
    training,
    video_tools,
    wiki,
)
from web.backend.ws import system_ws, training_ws

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="OneTrainerWeb API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        # Electron production loads from file:// which sends Origin: null
        "null",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

_routers = [
    health.router,
    config.router,
    presets.router,
    concepts.router,
    samples.router,
    secrets.router,
    tensorboard.router,
    training.router,
    wiki.router,
    system.router,
    tools.router,
    converter.router,
    video_tools.router,
    sampling.router,
]
for _router in _routers:
    app.include_router(_router, prefix="/api")

# WebSocket routes (no /api prefix — WebSocket paths are at root)
app.include_router(training_ws.router)
app.include_router(system_ws.router)
