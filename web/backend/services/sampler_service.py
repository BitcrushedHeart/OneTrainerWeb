"""
Singleton service for standalone model sampling without an active training session.

This mirrors the standalone sampling mode from ``modules/ui/SampleWindow.py``
where a model is loaded independently (no active training run) and used to
generate samples on demand.

All heavy ``modules/`` and ``torch`` imports are lazy (inside method bodies)
to avoid pulling in PyTorch at FastAPI startup.
"""

import logging
import os
import threading
import traceback
from contextlib import suppress
from typing import Any

from web.backend.services._serialization import serialize_sample
from web.backend.services._singleton import SingletonMixin
from web.backend.services.config_service import ConfigService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SamplerService
# ---------------------------------------------------------------------------

class SamplerService(SingletonMixin):
    """
    Thread-safe singleton that manages standalone model sampling.

    The lifecycle is:
    1. ``load_model()`` — load a model from the current config (lazy on first sample)
    2. ``sample()``     — generate a sample using the loaded model
    3. ``unload_model()`` — release GPU memory

    This is completely independent of ``TrainerService`` and can be used
    when no training run is active.
    """

    def __init__(self) -> None:
        self._model: Any | None = None
        self._model_sampler: Any | None = None
        self._train_config: Any | None = None  # The config snapshot used to load the model
        self._status: str = "idle"  # "idle" | "loading" | "ready" | "sampling" | "error"
        self._error: str | None = None
        self._lock = threading.Lock()
        self._latest_sample: dict | None = None
        self._sample_progress: dict = {"step": 0, "max_step": 0}

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self) -> dict:
        """Return a snapshot of the current sampler status."""
        with self._lock:
            return {
                "status": self._status,
                "error": self._error,
                "model_loaded": self._model is not None,
                "sample_progress": dict(self._sample_progress),
            }

    def _set_status(self, status: str, error: str | None = None) -> None:
        with self._lock:
            self._status = status
            self._error = error

    # ------------------------------------------------------------------
    # Model loading  (mirrors SampleWindow.__load_model)
    # ------------------------------------------------------------------

    def load_model(self) -> dict:
        """
        Load a model for standalone sampling based on the current config.

        Mirrors ``SampleWindow.__load_model()``:
        1. Deep-copy the current config and optimise for sampling
        2. Create model loader, load model
        3. Setup optimisations and devices
        4. Create model sampler
        """
        with self._lock:
            if self._status in ("loading", "sampling"):
                return {"ok": False, "error": f"Cannot load model while {self._status}"}
            self._status = "loading"
            self._error = None

        try:
            # Lazy imports — avoid pulling torch at module scope
            from modules.util import create
            from modules.util.config.TrainConfig import TrainConfig
            from modules.util.enum.EMAMode import EMAMode
            from modules.util.enum.TrainingMethod import TrainingMethod

            import torch

            # 1. Deep-copy and optimise config
            config_service = ConfigService.get_instance()
            config_dict = config_service.get_config_dict()

            train_config = TrainConfig.default_values()
            train_config.from_dict(config_dict)

            # Store the full config for sample() to reference later
            self._train_config = train_config

            # Create an optimised copy for loading (no optimizer, no EMA)
            initial_config = TrainConfig.default_values().from_dict(config_dict)
            initial_config.optimizer.optimizer = None
            initial_config.ema = EMAMode.OFF

            # 2. Create model loader
            model_loader = create.create_model_loader(
                model_type=initial_config.model_type,
                training_method=initial_config.training_method,
            )

            # 3. Create model setup
            model_setup = create.create_model_setup(
                model_type=initial_config.model_type,
                train_device=torch.device(initial_config.train_device),
                temp_device=torch.device(initial_config.temp_device),
                training_method=initial_config.training_method,
            )

            # 4. Resolve model names (handle backup continuation)
            model_names = initial_config.model_names()
            if initial_config.continue_last_backup:
                last_backup_path = initial_config.get_last_backup_path()
                if last_backup_path:
                    if initial_config.training_method == TrainingMethod.LORA:
                        model_names.lora = last_backup_path
                    elif initial_config.training_method == TrainingMethod.EMBEDDING:
                        model_names.embedding.model_name = last_backup_path
                    else:
                        model_names.base_model = last_backup_path
                    logger.info("Loading from backup '%s'", last_backup_path)

            # 5. Ensure quantization cache dir exists
            if initial_config.quantization.cache_dir is None:
                initial_config.quantization.cache_dir = initial_config.cache_dir + "/quantization"
                os.makedirs(initial_config.quantization.cache_dir, exist_ok=True)

            # 6. Load the model
            model = model_loader.load(
                model_type=initial_config.model_type,
                model_names=model_names,
                weight_dtypes=initial_config.weight_dtypes(),
                quantization=initial_config.quantization,
            )
            model.train_config = initial_config

            # 7. Setup optimisations and devices
            model_setup.setup_optimizations(model, initial_config)
            model_setup.setup_train_device(model, initial_config)
            model_setup.setup_model(model, initial_config)
            model.to(torch.device(initial_config.temp_device))

            # 8. Create model sampler
            model_sampler = create.create_model_sampler(
                train_device=torch.device(initial_config.train_device),
                temp_device=torch.device(initial_config.temp_device),
                model=model,
                model_type=initial_config.model_type,
                training_method=initial_config.training_method,
            )

            with self._lock:
                self._model = model
                self._model_sampler = model_sampler
                self._status = "ready"
                self._error = None

            logger.info("Standalone sampling model loaded successfully")
            return {"ok": True}

        except Exception as exc:
            traceback.print_exc()
            # Clean up any partially-loaded model to free GPU memory
            with self._lock:
                self._model = None
                self._model_sampler = None
                self._train_config = None
            with suppress(Exception):
                import torch
                torch.clear_autocast_cache()
            with suppress(Exception):
                from modules.util.torch_util import torch_gc
                torch_gc()
            self._set_status("error", str(exc))
            return {"ok": False, "error": str(exc)}

    # ------------------------------------------------------------------
    # Sample generation  (mirrors SampleWindow.__sample standalone path)
    # ------------------------------------------------------------------

    def sample(self, sample_params: dict) -> dict:
        """
        Generate a sample using the loaded model.

        If the model has not been loaded yet, lazy-load it first.

        Parameters
        ----------
        sample_params:
            Dict of SampleConfig fields (prompt, negative_prompt, width,
            height, seed, random_seed, diffusion_steps, cfg_scale, etc.).

        Returns
        -------
        dict with ``{"ok": True, "sample": {...}}`` on success, or
        ``{"ok": False, "error": "..."}`` on failure.
        """
        # Check status
        with self._lock:
            if self._status == "sampling":
                return {"ok": False, "error": "A sample is already being generated"}
            if self._status == "loading":
                return {"ok": False, "error": "Model is currently loading"}

        # Lazy-load model if not ready
        if self._model is None:
            load_result = self.load_model()
            if not load_result.get("ok"):
                return load_result

        with self._lock:
            if self._model is None or self._model_sampler is None:
                return {"ok": False, "error": "Model is not loaded"}
            self._status = "sampling"
            self._error = None
            self._sample_progress = {"step": 0, "max_step": 0}

        try:
            import os

            from modules.util.config.SampleConfig import SampleConfig
            from modules.util.time_util import get_string_timestamp

            # Build sample config from params
            sample_config = SampleConfig.default_values()
            sample_config.from_dict(sample_params)
            sample_config.from_train_config(self._train_config)

            # Prepare sample output directory
            sample_dir = os.path.join(
                self._train_config.workspace_dir,
                "samples",
                "standalone",
            )
            os.makedirs(sample_dir, exist_ok=True)

            progress = self._model.train_progress
            sample_path = os.path.join(
                sample_dir,
                f"{get_string_timestamp()}-standalone-sample-{progress.filename_string()}",
            )

            # Capture the latest sample output
            captured_output: list[Any] = []

            def on_sample(sampler_output: Any) -> None:
                captured_output.append(sampler_output)

            def on_progress(step: int, max_step: int) -> None:
                with self._lock:
                    self._sample_progress = {"step": step, "max_step": max_step}

            # Generate
            self._model.eval()
            self._model_sampler.sample(
                sample_config=sample_config,
                destination=sample_path,
                image_format=self._train_config.sample_image_format,
                video_format=self._train_config.sample_video_format,
                audio_format=self._train_config.sample_audio_format,
                on_sample=on_sample,
                on_update_progress=on_progress,
            )

            # Serialise the result
            result_data: dict | None = None
            if captured_output:
                with suppress(Exception):
                    result_data = serialize_sample(captured_output[-1])

            with self._lock:
                self._latest_sample = result_data
                self._status = "ready"
                self._sample_progress = {"step": 0, "max_step": 0}

            return {"ok": True, "sample": result_data}

        except Exception as exc:
            traceback.print_exc()
            self._set_status("error", str(exc))
            return {"ok": False, "error": str(exc)}

    # ------------------------------------------------------------------
    # Model unloading
    # ------------------------------------------------------------------

    def unload_model(self) -> dict:
        """Release the loaded model and free GPU memory."""
        with self._lock:
            if self._status == "sampling":
                return {"ok": False, "error": "Cannot unload while sampling"}
            if self._model is None:
                return {"ok": True}  # Already unloaded

            self._model = None
            self._model_sampler = None
            self._train_config = None
            self._latest_sample = None
            self._sample_progress = {"step": 0, "max_step": 0}
            self._status = "idle"
            self._error = None

        # Release GPU memory
        with suppress(Exception):
            import torch
            torch.clear_autocast_cache()
        with suppress(Exception):
            from modules.util.torch_util import torch_gc
            torch_gc()

        logger.info("Standalone sampling model unloaded")
        return {"ok": True}
