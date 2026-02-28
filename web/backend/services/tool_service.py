import logging
import threading
import traceback
import uuid
from contextlib import suppress
from typing import Any, Literal

from web.backend.services._singleton import SingletonMixin

logger = logging.getLogger(__name__)

ToolStatus = Literal["idle", "running", "completed", "error"]

VALID_CAPTION_MODES = {"replace", "fill", "add"}

VALID_MASK_MODES = {"replace", "fill", "add", "subtract", "blend"}

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


class ToolService(SingletonMixin):

    def __init__(self) -> None:
        self._status: ToolStatus = "idle"
        self._progress: int = 0
        self._max_progress: int = 0
        self._error_message: str | None = None
        self._task_id: str | None = None
        self._thread: threading.Thread | None = None
        self._cancel_flag: bool = False
        self._lock = threading.Lock()

        self._captioning_model: Any = None
        self._masking_model: Any = None

    def _set_status(self, status: ToolStatus, error: str | None = None) -> None:
        with self._lock:
            self._status = status
            self._error_message = error

    def _update_progress(self, current: int, total: int) -> None:
        with self._lock:
            self._progress = current
            self._max_progress = total

    def get_status(self) -> dict:
        with self._lock:
            return {
                "status": self._status,
                "progress": self._progress,
                "max_progress": self._max_progress,
                "error": self._error_message,
                "task_id": self._task_id,
            }

    def _start_background_task(self, target, args: tuple, thread_name: str) -> dict:
        task_id = str(uuid.uuid4())
        with self._lock:
            if self._status == "running":
                return {"ok": False, "error": "A tool operation is already running"}
            self._status = "running"
            self._progress = 0
            self._max_progress = 0
            self._error_message = None
            self._task_id = task_id
            self._cancel_flag = False

        thread = threading.Thread(
            target=target, args=(*args, task_id),
            daemon=True, name=thread_name,
        )
        self._thread = thread
        thread.start()
        return {"ok": True, "task_id": task_id}

    def generate_captions(self, request: Any) -> dict:
        return self._start_background_task(
            self._caption_thread_fn, (request,), "OneTrainerWeb-caption-tool",
        )

    def _caption_thread_fn(self, request: Any, task_id: str) -> None:
        try:
            model = self._load_captioning_model(request.model)
            if model is None:
                self._set_status("error", f"Unknown captioning model: {request.model}")
                return

            mode = request.mode if request.mode in VALID_CAPTION_MODES else "fill"

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
            self._set_status("error", "Caption generation failed -- check the Terminal panel for details")
        finally:
            self._thread = None
            self._release_models()

    def generate_masks(self, request: Any) -> dict:
        return self._start_background_task(
            self._mask_thread_fn, (request,), "OneTrainerWeb-mask-tool",
        )

    def _mask_thread_fn(self, request: Any, task_id: str) -> None:
        try:
            model = self._load_masking_model(request.model)
            if model is None:
                self._set_status("error", f"Unknown masking model: {request.model}")
                return

            mode = request.mode if request.mode in VALID_MASK_MODES else "fill"
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
            self._set_status("error", "Mask generation failed -- check the Terminal panel for details")
        finally:
            self._thread = None
            self._release_models()

    def cancel(self) -> dict:
        with self._lock:
            if self._status != "running":
                return {"ok": False, "error": "No tool operation is running"}
            self._cancel_flag = True
            self._status = "idle"
            self._error_message = None
        return {"ok": True}

    def _progress_callback(self, current: int, total: int) -> None:
        if self._cancel_flag:
            raise InterruptedError("Tool operation cancelled by user")
        self._update_progress(current, total)

    def _error_callback(self, filename: str) -> None:
        logger.warning("Tool error processing file: %s", filename)

    def _load_captioning_model(self, model_name: str) -> Any:
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
