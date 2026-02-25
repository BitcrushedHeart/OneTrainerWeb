"""
Singleton service that manages dataset tool operations (captioning and masking).

This mirrors the tool logic in ``modules/ui/CaptionUI.py`` (load_captioning_model,
load_masking_model) and ``modules/ui/GenerateCaptionsWindow.py`` /
``modules/ui/GenerateMasksWindow.py`` but decouples it from the customtkinter GUI
and exposes it through a clean API that the FastAPI routers can call.

Tool operations run in a background thread so the REST API can respond immediately.
"""

import logging
import threading
import traceback
import uuid
from contextlib import suppress
from typing import Any

from web.backend.services._singleton import SingletonMixin

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Display-name to internal mode-string mappings (match legacy UI windows)
# ---------------------------------------------------------------------------

CAPTION_MODE_MAP: dict[str, str] = {
    "replace": "replace",
    "fill": "fill",
    "add": "add",
}

MASK_MODE_MAP: dict[str, str] = {
    "replace": "replace",
    "fill": "fill",
    "add": "add",
    "subtract": "subtract",
    "blend": "blend",
}

# Display-name to model class mapping (mirrors CaptionUI.load_captioning_model)
CAPTION_MODEL_MAP: dict[str, str] = {
    "Blip": "BlipModel",
    "Blip2": "Blip2Model",
    "WD14 VIT v2": "WDModel",
}

MASK_MODEL_MAP: dict[str, str] = {
    "ClipSeg": "ClipSegModel",
    "Rembg": "RembgModel",
    "Rembg-Human": "RembgHumanModel",
    "Hex Color": "MaskByColor",
}


# ---------------------------------------------------------------------------
# ToolService
# ---------------------------------------------------------------------------

class ToolService(SingletonMixin):
    """
    Thread-safe singleton that owns a single background tool thread and
    exposes lifecycle commands (generate, cancel, status).
    """

    def __init__(self) -> None:
        self._status: str = "idle"  # "idle" | "running" | "completed" | "error"
        self._progress: int = 0
        self._max_progress: int = 0
        self._error_message: str | None = None
        self._task_id: str | None = None
        self._thread: threading.Thread | None = None
        self._cancel_flag: bool = False
        self._lock = threading.Lock()

        # Cached model instances (reused across runs, like CaptionUI)
        self._captioning_model: Any = None
        self._masking_model: Any = None

    # ------------------------------------------------------------------
    # Status helpers (thread-safe)
    # ------------------------------------------------------------------

    def _set_status(self, status: str, error: str | None = None) -> None:
        with self._lock:
            self._status = status
            self._error_message = error

    def _update_progress(self, current: int, total: int) -> None:
        with self._lock:
            self._progress = current
            self._max_progress = total

    def get_status(self) -> dict:
        """Return a snapshot of the current tool operation status."""
        with self._lock:
            return {
                "status": self._status,
                "progress": self._progress,
                "max_progress": self._max_progress,
                "error": self._error_message,
                "task_id": self._task_id,
            }

    # ------------------------------------------------------------------
    # Caption generation
    # ------------------------------------------------------------------

    def generate_captions(self, request: Any) -> dict:
        """
        Start a batch caption generation operation in a background thread.

        Returns ``{"ok": True, "task_id": "..."}`` on success, or
        ``{"ok": False, "error": "..."}`` if a tool operation is already running.
        """
        with self._lock:
            if self._status == "running":
                return {"ok": False, "error": "A tool operation is already running"}

        task_id = str(uuid.uuid4())
        self._task_id = task_id
        self._cancel_flag = False
        self._set_status("running")
        self._update_progress(0, 0)

        thread = threading.Thread(
            target=self._caption_thread_fn,
            args=(request, task_id),
            daemon=True,
            name="OneTrainerWeb-caption-tool",
        )
        self._thread = thread
        thread.start()

        return {"ok": True, "task_id": task_id}

    def _caption_thread_fn(self, request: Any, task_id: str) -> None:
        """Run captioning in a dedicated thread."""
        try:
            model = self._load_captioning_model(request.model)
            if model is None:
                self._set_status("error", f"Unknown captioning model: {request.model}")
                return

            mode = CAPTION_MODE_MAP.get(request.mode, "fill")

            model.caption_folder(
                sample_dir=request.folder,
                initial_caption=request.initial_caption,
                caption_prefix=request.caption_prefix,
                caption_postfix=request.caption_postfix,
                mode=mode,
                progress_callback=self._progress_callback,
                error_callback=self._error_callback,
                include_subdirectories=request.include_subdirectories,
            )

            with self._lock:
                if self._status == "running":
                    self._status = "completed"

        except InterruptedError:
            logger.info("Caption generation cancelled by user")
            self._set_status("idle")
        except Exception:
            traceback.print_exc()
            self._set_status("error", "Caption generation failed -- check the console for details")
        finally:
            self._thread = None
            self._release_models()

    # ------------------------------------------------------------------
    # Mask generation
    # ------------------------------------------------------------------

    def generate_masks(self, request: Any) -> dict:
        """
        Start a batch mask generation operation in a background thread.

        Returns ``{"ok": True, "task_id": "..."}`` on success, or
        ``{"ok": False, "error": "..."}`` if a tool operation is already running.
        """
        with self._lock:
            if self._status == "running":
                return {"ok": False, "error": "A tool operation is already running"}

        task_id = str(uuid.uuid4())
        self._task_id = task_id
        self._cancel_flag = False
        self._set_status("running")
        self._update_progress(0, 0)

        thread = threading.Thread(
            target=self._mask_thread_fn,
            args=(request, task_id),
            daemon=True,
            name="OneTrainerWeb-mask-tool",
        )
        self._thread = thread
        thread.start()

        return {"ok": True, "task_id": task_id}

    def _mask_thread_fn(self, request: Any, task_id: str) -> None:
        """Run mask generation in a dedicated thread."""
        try:
            model = self._load_masking_model(request.model)
            if model is None:
                self._set_status("error", f"Unknown masking model: {request.model}")
                return

            mode = MASK_MODE_MAP.get(request.mode, "fill")
            prompts = [request.prompt] if request.prompt else []

            model.mask_folder(
                sample_dir=request.folder,
                prompts=prompts,
                mode=mode,
                threshold=request.threshold,
                smooth_pixels=request.smooth,
                expand_pixels=request.expand,
                alpha=request.alpha,
                progress_callback=self._progress_callback,
                error_callback=self._error_callback,
                include_subdirectories=request.include_subdirectories,
            )

            with self._lock:
                if self._status == "running":
                    self._status = "completed"

        except InterruptedError:
            logger.info("Mask generation cancelled by user")
            self._set_status("idle")
        except Exception:
            traceback.print_exc()
            self._set_status("error", "Mask generation failed -- check the console for details")
        finally:
            self._thread = None
            self._release_models()

    # ------------------------------------------------------------------
    # Cancel
    # ------------------------------------------------------------------

    def cancel(self) -> dict:
        """Request cancellation of the current tool operation."""
        with self._lock:
            if self._status != "running":
                return {"ok": False, "error": "No tool operation is running"}
            self._cancel_flag = True
            self._status = "idle"
            self._error_message = None
        return {"ok": True}

    # ------------------------------------------------------------------
    # Progress callback (called from the model on the tool thread)
    # ------------------------------------------------------------------

    def _progress_callback(self, current: int, total: int) -> None:
        if self._cancel_flag:
            raise InterruptedError("Tool operation cancelled by user")
        self._update_progress(current, total)

    def _error_callback(self, filename: str) -> None:
        logger.warning("Tool error processing file: %s", filename)

    # ------------------------------------------------------------------
    # Model loading (mirrors CaptionUI.load_captioning_model / load_masking_model)
    # ------------------------------------------------------------------

    def _load_captioning_model(self, model_name: str) -> Any:
        """
        Lazily load the requested captioning model.

        All torch/model imports are deferred to here so that the FastAPI
        process does not load heavy ML dependencies at startup.
        """
        from modules.util.torch_util import default_device

        import torch

        current_type = type(self._captioning_model).__name__ if self._captioning_model else None

        if model_name == "Blip" and current_type != "BlipModel":
            self._release_models()
            logger.info("Loading Blip captioning model...")
            from modules.module.BlipModel import BlipModel
            self._captioning_model = BlipModel(default_device, torch.float16)
        elif model_name == "Blip2" and current_type != "Blip2Model":
            self._release_models()
            logger.info("Loading Blip2 captioning model...")
            from modules.module.Blip2Model import Blip2Model
            self._captioning_model = Blip2Model(default_device, torch.float16)
        elif model_name == "WD14 VIT v2" and current_type != "WDModel":
            self._release_models()
            logger.info("Loading WD14 VIT v2 captioning model...")
            from modules.module.WDModel import WDModel
            self._captioning_model = WDModel(default_device, torch.float16)
        elif model_name not in CAPTION_MODEL_MAP:
            return None

        return self._captioning_model

    def _load_masking_model(self, model_name: str) -> Any:
        """
        Lazily load the requested masking model.

        All torch/model imports are deferred to here so that the FastAPI
        process does not load heavy ML dependencies at startup.
        """
        from modules.util.torch_util import default_device

        import torch

        current_type = type(self._masking_model).__name__ if self._masking_model else None

        if model_name == "ClipSeg" and current_type != "ClipSegModel":
            self._release_models()
            logger.info("Loading ClipSeg masking model...")
            from modules.module.ClipSegModel import ClipSegModel
            self._masking_model = ClipSegModel(default_device, torch.float32)
        elif model_name == "Rembg" and current_type != "RembgModel":
            self._release_models()
            logger.info("Loading Rembg masking model...")
            from modules.module.RembgModel import RembgModel
            self._masking_model = RembgModel(default_device, torch.float32)
        elif model_name == "Rembg-Human" and current_type != "RembgHumanModel":
            self._release_models()
            logger.info("Loading Rembg-Human masking model...")
            from modules.module.RembgHumanModel import RembgHumanModel
            self._masking_model = RembgHumanModel(default_device, torch.float32)
        elif model_name == "Hex Color" and current_type != "MaskByColor":
            self._release_models()
            logger.info("Loading Hex Color masking model...")
            from modules.module.MaskByColor import MaskByColor
            self._masking_model = MaskByColor(default_device, torch.float32)
        elif model_name not in MASK_MODEL_MAP:
            return None

        return self._masking_model

    def _release_models(self) -> None:
        """Release all tool models from memory and run garbage collection."""
        freed = False
        if self._captioning_model is not None:
            self._captioning_model = None
            freed = True
        if self._masking_model is not None:
            self._masking_model = None
            freed = True

        if freed:
            with suppress(Exception):
                from modules.util.torch_util import torch_gc
                torch_gc()
