import io
import json
import logging
import platform
import sys
import zipfile
from datetime import datetime, timezone

from web.backend.services.tool_service import ToolService

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["tools"])


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


@router.post("/tools/captions/generate", response_model=ToolActionResponse)
def generate_captions(req: CaptionRequest):
    service = ToolService.get_instance()
    result = service.generate_captions(req)
    return ToolActionResponse(**result)


@router.post("/tools/masks/generate", response_model=ToolActionResponse)
def generate_masks(req: MaskRequest):
    service = ToolService.get_instance()
    result = service.generate_masks(req)
    return ToolActionResponse(**result)


@router.get("/tools/status", response_model=ToolStatusResponse)
def get_status():
    service = ToolService.get_instance()
    status = service.get_status()
    return ToolStatusResponse(**status)


@router.post("/tools/cancel", response_model=ToolActionResponse)
def cancel_tool():
    service = ToolService.get_instance()
    result = service.cancel()
    return ToolActionResponse(**result)


def _collect_system_info() -> str:
    lines: list[str] = []

    uname = platform.uname()
    lines.append("=== System Information ===")
    lines.append(f"OS: {uname.system} {uname.release}")
    lines.append(f"Version: {uname.version}")
    lines.append(f"Machine: {uname.machine}")
    lines.append("")

    lines.append("=== Python Environment ===")
    lines.append(f"Python Version: {sys.version}")
    lines.append(f"Python Executable: {sys.executable}")
    lines.append("")

    lines.append("=== PyTorch / CUDA ===")
    try:
        import torch

        lines.append(f"PyTorch Version: {torch.__version__}")
        lines.append(f"CUDA Available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            lines.append(f"CUDA Version: {torch.version.cuda}")
            for i in range(torch.cuda.device_count()):
                name = torch.cuda.get_device_name(i)
                mem = torch.cuda.get_device_properties(i).total_memory
                mem_gb = round(mem / (1024**3), 2)
                lines.append(f"  GPU {i}: {name} ({mem_gb} GB)")
    except ImportError:
        lines.append("PyTorch not installed")
    except Exception as exc:
        lines.append(f"Error querying PyTorch: {exc}")
    lines.append("")

    lines.append("=== Memory ===")
    try:
        import psutil

        vm = psutil.virtual_memory()
        lines.append(f"Total RAM: {round(vm.total / (1024**3), 2)} GB")
        lines.append(f"Available RAM: {round(vm.available / (1024**3), 2)} GB")
    except ImportError:
        lines.append("psutil not installed -- cannot read memory info")
    except Exception as exc:
        lines.append(f"Error querying memory: {exc}")
    lines.append("")

    lines.append("=== CPU ===")
    lines.append(f"Processor: {platform.processor() or 'Unavailable'}")
    try:
        import psutil as _ps

        lines.append(f"Physical Cores: {_ps.cpu_count(logical=False)}")
        lines.append(f"Logical Cores: {_ps.cpu_count(logical=True)}")
    except ImportError:
        pass
    except Exception as exc:
        lines.append(f"Error querying CPU: {exc}")
    lines.append("")

    return "\n".join(lines)


def _collect_log_output() -> str:
    try:
        from web.backend.services.log_service import LogService

        history = LogService.get_instance().get_history()
        return "\n".join(entry["text"] for entry in history)
    except Exception as exc:
        return f"Error collecting log output: {exc}"


@router.post("/tools/debug-package")
def generate_debug_package():
    buf = io.BytesIO()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        try:
            from web.backend.services.config_service import ConfigService

            config_dict = ConfigService.get_instance().export_config()
            config_json = json.dumps(config_dict, indent=2, default=str)
            zf.writestr("config.json", config_json)
        except Exception as exc:
            logger.warning("Could not include config in debug package: %s", exc)
            zf.writestr("config.json", json.dumps({"error": str(exc)}))

        try:
            system_info = _collect_system_info()
            zf.writestr("system_info.txt", system_info)
        except Exception as exc:
            logger.warning("Could not collect system info: %s", exc)
            zf.writestr("system_info.txt", f"Error: {exc}")

        try:
            log_output = _collect_log_output()
            zf.writestr("log_output.txt", log_output)
        except Exception as exc:
            logger.warning("Could not collect log output: %s", exc)
            zf.writestr("log_output.txt", f"Error: {exc}")

    buf.seek(0)
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"OneTrainer_debug_{timestamp}.zip"

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
