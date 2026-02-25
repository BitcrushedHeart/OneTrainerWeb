"""
REST endpoints for dataset tools (batch captioning and masking).

All heavy lifting is delegated to ``ToolService``; these endpoints
are thin wrappers that translate HTTP requests into service method calls.
"""

from web.backend.services.tool_service import ToolService

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["tools"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class CaptionRequest(BaseModel):
    model: str = "Blip"  # "Blip", "Blip2", "WD14 VIT v2"
    folder: str
    initial_caption: str = ""
    caption_prefix: str = ""
    caption_postfix: str = ""
    mode: str = "fill"  # "replace", "fill", "add"
    include_subdirectories: bool = False


class MaskRequest(BaseModel):
    model: str = "ClipSeg"  # "ClipSeg", "Rembg", "Rembg-Human", "Hex Color"
    folder: str
    prompt: str = ""
    mode: str = "fill"  # "replace", "fill", "add", "subtract", "blend"
    threshold: float = 0.3
    smooth: int = 5
    expand: int = 10
    alpha: float = 1.0
    include_subdirectories: bool = False


class ToolActionResponse(BaseModel):
    ok: bool
    error: str | None = None
    task_id: str | None = None


class ToolStatusResponse(BaseModel):
    status: str  # "idle", "running", "completed", "error"
    progress: int = 0
    max_progress: int = 0
    error: str | None = None
    task_id: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/tools/captions/generate", response_model=ToolActionResponse)
def generate_captions(req: CaptionRequest):
    """Start batch caption generation in a background thread."""
    service = ToolService.get_instance()
    result = service.generate_captions(req)
    return ToolActionResponse(**result)


@router.post("/tools/masks/generate", response_model=ToolActionResponse)
def generate_masks(req: MaskRequest):
    """Start batch mask generation in a background thread."""
    service = ToolService.get_instance()
    result = service.generate_masks(req)
    return ToolActionResponse(**result)


@router.get("/tools/status", response_model=ToolStatusResponse)
def get_status():
    """Return the current tool operation status and progress."""
    service = ToolService.get_instance()
    status = service.get_status()
    return ToolStatusResponse(**status)


@router.post("/tools/cancel", response_model=ToolActionResponse)
def cancel_tool():
    """Cancel the current tool operation."""
    service = ToolService.get_instance()
    result = service.cancel()
    return ToolActionResponse(**result)
