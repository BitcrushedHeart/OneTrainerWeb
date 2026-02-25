"""
REST endpoints for system metrics and information.

Provides one-shot snapshots of current system metrics (CPU, RAM, GPU)
and static system information.  For real-time streaming, use the
``/ws/system`` WebSocket endpoint in ``ws/system_ws.py``.
"""

from web.backend.services.monitor_service import MonitorService

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/system", tags=["system"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class GpuMetrics(BaseModel):
    index: int
    name: str
    vram_used_mb: float
    vram_total_mb: float
    vram_percent: float
    temperature: float | None = None
    utilization: float | None = None


class SystemMetricsResponse(BaseModel):
    cpu_percent: float
    ram_used_gb: float
    ram_total_gb: float
    ram_percent: float
    gpus: list[GpuMetrics]


class GpuInfo(BaseModel):
    index: int
    name: str
    vram_total_mb: float


class SystemInfoResponse(BaseModel):
    cpu_count: int
    cpu_count_physical: int | None = None
    ram_total_gb: float
    gpus: list[GpuInfo]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/metrics", response_model=SystemMetricsResponse)
def get_metrics():
    """Return a one-shot snapshot of current system metrics."""
    monitor = MonitorService.get_instance()
    return SystemMetricsResponse(**monitor.get_metrics())


@router.get("/info", response_model=SystemInfoResponse)
def get_info():
    """Return static system information (GPU names, total RAM, CPU count)."""
    monitor = MonitorService.get_instance()
    return SystemInfoResponse(**monitor.get_system_info())
