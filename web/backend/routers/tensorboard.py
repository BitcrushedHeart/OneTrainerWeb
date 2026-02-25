"""
REST endpoints for reading TensorBoard event data.

Provides endpoints to list runs, enumerate scalar tags, and fetch
scalar data points (with optional incremental reads via after_step).
"""

from fastapi import APIRouter, HTTPException, Query

from web.backend.services.config_service import ConfigService
from web.backend.services.tensorboard_service import TensorboardService

router = APIRouter(prefix="/tensorboard", tags=["tensorboard"])


@router.get("/runs")
def list_runs() -> list[str]:
    """
    List available training runs (subdirectories) under the configured
    TensorBoard log directory.
    """
    service = TensorboardService.get_instance()
    return service.list_runs()


@router.get("/scalars")
def list_tags(run: str = Query(..., description="Run name")) -> list[str]:
    """
    List all scalar tags found in a specific training run.
    """
    service = TensorboardService.get_instance()
    tags = service.list_tags(run)
    if not tags and not _run_exists(run):
        raise HTTPException(status_code=404, detail=f"Run not found: {run}")
    return tags


@router.get("/scalars/{tag:path}")
def get_scalars(
    tag: str,
    run: str = Query(..., description="Run name"),
    after_step: int = Query(0, description="Only return data after this step (for incremental updates)"),
) -> list[dict]:
    """
    Return scalar data points for a specific tag within a run.

    Each entry contains ``wall_time``, ``step``, and ``value``.
    Use ``after_step`` to fetch only new points since the last poll.
    """
    service = TensorboardService.get_instance()

    if not _run_exists(run):
        raise HTTPException(status_code=404, detail=f"Run not found: {run}")

    return service.get_scalars(run, tag, after_step=after_step)


@router.get("/config")
def get_tensorboard_config() -> dict:
    """
    Return the resolved TensorBoard log directory from the current config.
    """
    config_service = ConfigService.get_instance()
    workspace_dir = config_service.config.workspace_dir or "workspace"

    import os

    log_dir = os.path.join(workspace_dir, "run", "tensorboard")
    return {
        "log_dir": log_dir,
        "exists": os.path.isdir(log_dir),
    }


def _run_exists(run_name: str) -> bool:
    """Check whether the named run exists as a subdirectory."""
    service = TensorboardService.get_instance()
    runs = service.list_runs()
    return run_name in runs
