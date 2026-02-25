"""
REST endpoints for standalone model sampling (without an active training session).

These endpoints allow loading a model from the current config, generating
samples on demand, and unloading to free GPU memory.  This is independent
of the training lifecycle managed by ``TrainerService``.
"""

from web.backend.services.sampler_service import SamplerService

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["tools"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class SamplerActionResponse(BaseModel):
    ok: bool
    error: str | None = None


class SamplerSampleResponse(BaseModel):
    ok: bool
    error: str | None = None
    sample: dict | None = None


class SamplerStatusResponse(BaseModel):
    status: str  # "idle" | "loading" | "ready" | "sampling" | "error"
    error: str | None = None
    model_loaded: bool
    sample_progress: dict


class StandaloneSampleRequest(BaseModel):
    """Subset of SampleConfig fields for standalone sampling."""

    prompt: str = ""
    negative_prompt: str = ""
    height: int = 512
    width: int = 512
    seed: int = 42
    random_seed: bool = False
    diffusion_steps: int = 20
    cfg_scale: float = 7.0
    noise_scheduler: str = "DDIM"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/tools/sampling/load-model", response_model=SamplerActionResponse)
def load_sampling_model():
    """Load a model for standalone sampling based on the current config."""
    service = SamplerService.get_instance()
    result = service.load_model()
    return SamplerActionResponse(**result)


@router.post("/tools/sampling/sample", response_model=SamplerSampleResponse)
def standalone_sample(req: StandaloneSampleRequest):
    """Generate a sample using the standalone loaded model."""
    service = SamplerService.get_instance()
    result = service.sample(req.model_dump())
    return SamplerSampleResponse(**result)


@router.post("/tools/sampling/unload", response_model=SamplerActionResponse)
def unload_sampling_model():
    """Unload the standalone sampling model and free GPU memory."""
    service = SamplerService.get_instance()
    result = service.unload_model()
    return SamplerActionResponse(**result)


@router.get("/tools/sampling/status", response_model=SamplerStatusResponse)
def sampling_status():
    """Get the standalone sampling service status."""
    service = SamplerService.get_instance()
    status = service.get_status()
    return SamplerStatusResponse(**status)
