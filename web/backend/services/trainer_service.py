"""
Singleton service that manages the full training lifecycle.

This mirrors the training logic in ``modules/ui/TrainUI.py`` (start_training,
__training_thread_function, stop, sample, backup, save) but decouples it
from the customtkinter GUI layer and exposes it through a clean API that
the FastAPI routers and WebSocket handlers can call.

All progress and sample data is pushed to the frontend via a pluggable
``_ws_broadcast`` callback, which is set by the WebSocket module at
startup.
"""

import base64
import io
import logging
import threading
import time
import traceback
from collections.abc import Callable
from contextlib import suppress
from typing import Any

from web.backend.services._singleton import SingletonMixin
from web.backend.services.concept_service import ConceptService
from web.backend.services.config_service import ConfigService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helper: serialise ModelSamplerOutput for WebSocket transport
# ---------------------------------------------------------------------------

def _serialize_sample(sampler_output: Any) -> dict:
    """
    Convert a ``ModelSamplerOutput`` into a JSON-friendly dict with base64-
    encoded payload.

    Handles three file types (IMAGE, VIDEO, AUDIO).  ``FileType`` and
    ``ModelSamplerOutput`` are imported at call time to avoid pulling in
    torch/PIL at module scope.
    """
    from modules.util.enum.FileType import FileType

    file_type: FileType = sampler_output.file_type
    data = sampler_output.data

    if file_type == FileType.IMAGE:
        # PIL Image -> base64-encoded PNG
        buf = io.BytesIO()
        data.save(buf, format="PNG")
        encoded = base64.b64encode(buf.getvalue()).decode("ascii")
        return {"file_type": "IMAGE", "format": "png", "data": encoded}

    if file_type == FileType.VIDEO:
        if data is None:
            return {"file_type": "VIDEO", "format": "raw", "data": None}
        if isinstance(data, bytes):
            encoded = base64.b64encode(data).decode("ascii")
            return {"file_type": "VIDEO", "format": "raw", "data": encoded}
        # torch.Tensor -- drop the data.  The reference implementation's
        # ``__reduce__`` explicitly discards video tensors; actual video data
        # is fetched via workspace sync instead.
        return {"file_type": "VIDEO", "format": "raw", "data": None}

    if file_type == FileType.AUDIO:
        if data is None:
            return {"file_type": "AUDIO", "format": "raw", "data": None}
        encoded = base64.b64encode(data).decode("ascii") if isinstance(data, bytes) else None
        return {"file_type": "AUDIO", "format": "raw", "data": encoded}

    # Unknown file type -- return a stub so the broadcast never crashes.
    return {"file_type": str(file_type), "format": "unknown", "data": None}


# ---------------------------------------------------------------------------
# TrainerService
# ---------------------------------------------------------------------------

class TrainerService(SingletonMixin):
    """
    Thread-safe singleton that owns the training thread and exposes
    lifecycle commands (start, stop, sample, backup, save).

    Communication with the frontend happens exclusively through the
    ``_ws_broadcast`` callable which is injected by the WebSocket layer.
    """

    def __init__(self) -> None:
        self._status: str = "idle"  # "idle" | "running" | "stopping" | "error"
        self._error_message: str | None = None
        self._training_thread: threading.Thread | None = None
        self._training_commands: Any | None = None  # TrainCommands (lazy import)
        self._training_callbacks: Any | None = None  # TrainCallbacks (lazy import)
        self._start_time: float | None = None
        self._status_lock = threading.Lock()
        self._ws_broadcast: Callable[[dict], None] | None = None

    # ------------------------------------------------------------------
    # WebSocket broadcast plumbing
    # ------------------------------------------------------------------

    def set_ws_broadcast(self, fn: Callable[[dict], None]) -> None:
        """Inject the WebSocket broadcast function (set by the WS module)."""
        self._ws_broadcast = fn

    def _broadcast(self, message: dict) -> None:
        """Send *message* to all connected WebSocket clients, swallowing errors."""
        if self._ws_broadcast is not None:
            with suppress(Exception):
                self._ws_broadcast(message)

    # ------------------------------------------------------------------
    # Status helpers (thread-safe)
    # ------------------------------------------------------------------

    def _set_status(self, status: str, error_message: str | None = None) -> None:
        with self._status_lock:
            self._status = status
            self._error_message = error_message

    def get_status(self) -> dict:
        """Return a snapshot of the current training status."""
        with self._status_lock:
            return {
                "status": self._status,
                "error": self._error_message,
                "start_time": self._start_time,
            }

    # ------------------------------------------------------------------
    # Training lifecycle
    # ------------------------------------------------------------------

    def start_training(self, reattach: bool = False) -> dict:
        """
        Begin a training run.

        Parameters
        ----------
        reattach:
            If ``True``, passed through to ``create.create_trainer()`` so that
            the trainer reattaches to an existing cloud session instead of
            starting a new one.

        Returns a dict with ``{"ok": True}`` on success, or
        ``{"ok": False, "error": "..."}`` if training is already active.
        """
        with self._status_lock:
            if self._status in ("running", "stopping"):
                return {"ok": False, "error": f"Training is already {self._status}"}

        # 1. Flush concepts and samples to disk (mirrors TrainUI.save_default)
        config_service = ConfigService.get_instance()
        concept_service = ConceptService()

        config = config_service.config
        with suppress(Exception):
            concepts = concept_service.load_concepts(config.concept_file_name)
            concept_service.save_concepts(config.concept_file_name, concepts)
        with suppress(Exception):
            samples = concept_service.load_samples(config.sample_definition_file_name)
            concept_service.save_samples(config.sample_definition_file_name, samples)

        # 2. Deep-copy the config for the training thread
        train_config = config_service.get_config_for_training()

        # 3. TensorBoard management: if the trainer will start its own TB,
        #    stop the always-on subprocess to avoid port conflicts.
        if train_config.tensorboard and not train_config.tensorboard_always_on:
            self._stop_always_on_tensorboard()

        # 4. Create commands and callbacks
        from modules.util.callbacks.TrainCallbacks import TrainCallbacks
        from modules.util.commands.TrainCommands import TrainCommands

        commands = TrainCommands()

        callbacks = TrainCallbacks(
            on_update_train_progress=self._on_update_train_progress,
            on_update_status=self._on_update_status,
            on_sample_default=self._on_sample_default,
            on_update_sample_default_progress=self._on_update_sample_default_progress,
            on_sample_custom=self._on_sample_custom,
            on_update_sample_custom_progress=self._on_update_sample_custom_progress,
        )

        # 5. Create trainer (heavy import deferred to here)
        from modules.util import create

        trainer = create.create_trainer(train_config, callbacks, commands, reattach=reattach)

        # 6. Release GPU memory before starting (mirrors TrainUI.py line 793)
        with suppress(Exception):
            from modules.util.torch_util import torch_gc
            torch_gc()

        # 7. Spawn the training thread
        self._training_commands = commands
        self._training_callbacks = callbacks
        self._set_status("running")
        self._broadcast({"type": "status", "data": {"text": "Starting training..."}})

        thread = threading.Thread(
            target=self._training_thread_fn,
            args=(trainer, train_config),
            daemon=True,
            name="OneTrainerWeb-training",
        )
        self._training_thread = thread
        thread.start()

        return {"ok": True}

    # ------------------------------------------------------------------
    # Training thread (mirrors TrainUI.__training_thread_function)
    # ------------------------------------------------------------------

    def _training_thread_fn(self, trainer: Any, config: Any) -> None:
        """
        Run inside a dedicated thread.  Follows the same lifecycle as
        ``TrainUI.__training_thread_function``.
        """
        error_caught = False

        try:
            trainer.start()

            # Persist cloud secrets if cloud training was initialised
            if config.cloud.enabled:
                with suppress(Exception):
                    from web.backend.services.config_service import ConfigService as _CS
                    cs = _CS.get_instance()
                    with cs._config_lock:
                        cs.config.secrets.cloud.from_dict(config.secrets.cloud.to_dict())

            self._start_time = time.monotonic()
            trainer.train()
        except Exception:
            # Persist cloud secrets on the error path as well (mirrors TrainUI lines 757-758)
            if config.cloud.enabled:
                with suppress(Exception):
                    from web.backend.services.config_service import ConfigService as _CS
                    cs = _CS.get_instance()
                    with cs._config_lock:
                        cs.config.secrets.cloud.from_dict(config.secrets.cloud.to_dict())

            error_caught = True
            traceback.print_exc()
        finally:
            with suppress(Exception):
                trainer.end()

        # -- Cleanup --
        del trainer

        self._training_thread = None
        self._training_commands = None
        self._training_callbacks = None

        # Release GPU memory
        with suppress(Exception):
            import torch
            torch.clear_autocast_cache()
        with suppress(Exception):
            from modules.util.torch_util import torch_gc
            torch_gc()

        # Update status
        if error_caught:
            self._set_status("error", "Training failed -- check the console for details")
            self._broadcast({"type": "status", "data": {"text": "Error: check the console for details"}})
        else:
            self._set_status("idle")
            self._broadcast({"type": "status", "data": {"text": "Stopped"}})

        self._start_time = None

        # Restart always-on TensorBoard if it was active before training
        if config.tensorboard_always_on:
            with suppress(Exception):
                self._start_always_on_tensorboard()

    # ------------------------------------------------------------------
    # Commands (forwarded to TrainCommands)
    # ------------------------------------------------------------------

    def stop_training(self) -> dict:
        """Request a graceful training stop."""
        with self._status_lock:
            if self._status != "running":
                return {"ok": False, "error": "Training is not running"}
            self._status = "stopping"
            self._error_message = None

        self._broadcast({"type": "status", "data": {"text": "Stopping..."}})

        commands = self._training_commands
        if commands is not None:
            with suppress(Exception):
                commands.stop()

        return {"ok": True}

    def sample_now(self) -> dict:
        """Request a default sample during training."""
        commands = self._training_commands
        if commands is None:
            return {"ok": False, "error": "Training is not running"}
        with suppress(Exception):
            commands.sample_default()
        return {"ok": True}

    def sample_custom(self, sample_params: Any) -> dict:
        """Request a custom sample with the given SampleConfig."""
        commands = self._training_commands
        if commands is None:
            return {"ok": False, "error": "Training is not running"}
        with suppress(Exception):
            commands.sample_custom(sample_params)
        return {"ok": True}

    def backup_now(self) -> dict:
        """Request an immediate backup."""
        commands = self._training_commands
        if commands is None:
            return {"ok": False, "error": "Training is not running"}
        with suppress(Exception):
            commands.backup()
        return {"ok": True}

    def save_now(self) -> dict:
        """Request an immediate save."""
        commands = self._training_commands
        if commands is None:
            return {"ok": False, "error": "Training is not running"}
        with suppress(Exception):
            commands.save()
        return {"ok": True}

    # ------------------------------------------------------------------
    # Callback handlers (invoked by the trainer on its thread)
    # ------------------------------------------------------------------

    def _on_update_train_progress(self, train_progress: Any, max_step: int, max_epoch: int) -> None:
        self._broadcast({
            "type": "progress",
            "data": {
                "epoch": train_progress.epoch,
                "epoch_step": train_progress.epoch_step,
                "epoch_sample": train_progress.epoch_sample,
                "global_step": train_progress.global_step,
                "max_step": max_step,
                "max_epoch": max_epoch,
            },
        })

    def _on_update_status(self, status_text: str) -> None:
        self._broadcast({"type": "status", "data": {"text": status_text}})

    def _on_sample_default(self, sampler_output: Any) -> None:
        with suppress(Exception):
            payload = _serialize_sample(sampler_output)
            self._broadcast({"type": "sample", "data": payload})

    def _on_update_sample_default_progress(self, step: int, max_step: int) -> None:
        self._broadcast({
            "type": "sample_progress",
            "data": {"step": step, "max_step": max_step},
        })

    def _on_sample_custom(self, sampler_output: Any) -> None:
        with suppress(Exception):
            payload = _serialize_sample(sampler_output)
            self._broadcast({"type": "sample", "data": payload})

    def _on_update_sample_custom_progress(self, step: int, max_step: int) -> None:
        self._broadcast({
            "type": "sample_progress",
            "data": {"step": step, "max_step": max_step},
        })

    # ------------------------------------------------------------------
    # TensorBoard subprocess helpers
    # ------------------------------------------------------------------
    # These mirror the always-on TensorBoard management from TrainUI.
    # A lightweight subprocess is spawned/killed as needed so that TB
    # remains accessible between training runs when the user enables
    # "Always-On TensorBoard".

    _always_on_tensorboard_subprocess: Any = None  # subprocess.Popen | None

    def _start_always_on_tensorboard(self) -> None:
        import os
        import subprocess
        import sys

        self._stop_always_on_tensorboard()

        config = ConfigService.get_instance().config

        tensorboard_executable = os.path.join(os.path.dirname(sys.executable), "tensorboard")
        tensorboard_log_dir = os.path.join(config.workspace_dir, "tensorboard")
        os.makedirs(os.path.abspath(tensorboard_log_dir), exist_ok=True)

        args = [
            tensorboard_executable,
            "--logdir", tensorboard_log_dir,
            "--port", str(config.tensorboard_port),
            "--samples_per_plugin=images=100,scalars=10000",
        ]

        if config.tensorboard_expose:
            args.append("--bind_all")

        try:
            self.__class__._always_on_tensorboard_subprocess = subprocess.Popen(args)
        except Exception:
            self.__class__._always_on_tensorboard_subprocess = None

    def _stop_always_on_tensorboard(self) -> None:
        import subprocess

        proc = self.__class__._always_on_tensorboard_subprocess
        if proc is not None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            except Exception:
                pass
            finally:
                self.__class__._always_on_tensorboard_subprocess = None
