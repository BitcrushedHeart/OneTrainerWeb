"""
Singleton service that collects real-time system metrics (CPU, RAM, GPU).

Uses ``psutil`` for CPU/RAM metrics (always available).  For GPU metrics
the service attempts ``pynvml`` first (most reliable), falls back to
``torch.cuda`` if available, and returns an empty GPU list otherwise.

All GPU access is wrapped in try/except so the service never crashes on
systems without a GPU or without NVIDIA drivers.
"""

import logging
import threading
from contextlib import suppress

from web.backend.services._singleton import SingletonMixin

import psutil

logger = logging.getLogger(__name__)


class MonitorService(SingletonMixin):
    """Thread-safe singleton that provides system metric snapshots."""

    def __init__(self) -> None:
        self._nvml_initialized: bool = False
        self._nvml_available: bool = False
        self._nvml_init_lock = threading.Lock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_metrics(self) -> dict:
        """
        Return a snapshot of current system metrics.

        Returns a dict with keys:
            cpu_percent  (float)   – overall CPU usage percentage
            ram_used_gb  (float)   – used RAM in GiB
            ram_total_gb (float)   – total RAM in GiB
            ram_percent  (float)   – RAM usage percentage
            gpus         (list)    – per-GPU dicts (see ``_get_gpu_metrics``)
        """
        # CPU / RAM (psutil is always available)
        cpu_percent = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()

        return {
            "cpu_percent": cpu_percent,
            "ram_used_gb": round(mem.used / (1024 ** 3), 2),
            "ram_total_gb": round(mem.total / (1024 ** 3), 2),
            "ram_percent": mem.percent,
            "gpus": self._get_gpu_metrics(),
        }

    def get_system_info(self) -> dict:
        """
        Return static system information (does not change over the
        lifetime of the process).
        """
        mem = psutil.virtual_memory()
        info: dict = {
            "cpu_count": psutil.cpu_count(logical=True),
            "cpu_count_physical": psutil.cpu_count(logical=False),
            "ram_total_gb": round(mem.total / (1024 ** 3), 2),
            "gpus": [],
        }

        # Attempt to get static GPU info
        try:
            gpu_info = self._get_gpu_static_info()
            info["gpus"] = gpu_info
        except Exception:  # noqa: BLE001
            pass

        return info

    # ------------------------------------------------------------------
    # NVML initialisation (lazy, thread-safe)
    # ------------------------------------------------------------------

    def _ensure_nvml(self) -> bool:
        """
        Lazy-initialise pynvml on first call.  Returns True if NVML is
        available and initialised, False otherwise.
        """
        if self._nvml_initialized:
            return self._nvml_available

        with self._nvml_init_lock:
            # Double-checked locking
            if self._nvml_initialized:
                return self._nvml_available

            try:
                import pynvml
                pynvml.nvmlInit()
                self._nvml_available = True
                logger.info("pynvml initialised successfully")
            except Exception:  # noqa: BLE001
                self._nvml_available = False
                logger.debug("pynvml not available, will try torch.cuda fallback")
            finally:
                self._nvml_initialized = True

        return self._nvml_available

    # ------------------------------------------------------------------
    # GPU metrics collection
    # ------------------------------------------------------------------

    def _get_gpu_metrics(self) -> list[dict]:
        """
        Collect per-GPU metrics.  Tries pynvml first, then torch.cuda.
        Returns an empty list if no GPU info is available.
        """
        # Strategy 1: pynvml (most complete)
        if self._ensure_nvml():
            try:
                return self._get_gpu_metrics_nvml()
            except Exception:  # noqa: BLE001
                logger.debug("pynvml metrics failed, trying torch.cuda fallback")

        # Strategy 2: torch.cuda
        try:
            return self._get_gpu_metrics_torch()
        except Exception:  # noqa: BLE001
            pass

        return []

    def _get_gpu_metrics_nvml(self) -> list[dict]:
        """Collect GPU metrics via pynvml."""
        import pynvml

        device_count = pynvml.nvmlDeviceGetCount()
        gpus: list[dict] = []

        for i in range(device_count):
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                name = pynvml.nvmlDeviceGetName(handle)
                if isinstance(name, bytes):
                    name = name.decode("utf-8")

                mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                vram_used_mb = round(mem_info.used / (1024 ** 2), 1)
                vram_total_mb = round(mem_info.total / (1024 ** 2), 1)
                vram_percent = round((mem_info.used / mem_info.total) * 100, 1) if mem_info.total > 0 else 0.0

                # Temperature (may not be available on all GPUs)
                temperature: float | None = None
                with suppress(Exception):
                    temperature = float(pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))

                # Utilization (may not be available on all GPUs)
                utilization: float | None = None
                with suppress(Exception):
                    util_rates = pynvml.nvmlDeviceGetUtilizationRates(handle)
                    utilization = float(util_rates.gpu)

                gpus.append({
                    "index": i,
                    "name": name,
                    "vram_used_mb": vram_used_mb,
                    "vram_total_mb": vram_total_mb,
                    "vram_percent": vram_percent,
                    "temperature": temperature,
                    "utilization": utilization,
                })
            except Exception:  # noqa: BLE001, PERF203
                logger.debug("Failed to read GPU %d via pynvml", i)

        return gpus

    def _get_gpu_metrics_torch(self) -> list[dict]:
        """Collect GPU metrics via torch.cuda (fallback)."""
        import torch

        if not torch.cuda.is_available():
            return []

        device_count = torch.cuda.device_count()
        gpus: list[dict] = []

        for i in range(device_count):
            try:
                name = torch.cuda.get_device_name(i)
                mem_allocated = torch.cuda.memory_allocated(i)
                mem_total = torch.cuda.get_device_properties(i).total_mem
                vram_used_mb = round(mem_allocated / (1024 ** 2), 1)
                vram_total_mb = round(mem_total / (1024 ** 2), 1)
                vram_percent = round((mem_allocated / mem_total) * 100, 1) if mem_total > 0 else 0.0

                gpus.append({
                    "index": i,
                    "name": name,
                    "vram_used_mb": vram_used_mb,
                    "vram_total_mb": vram_total_mb,
                    "vram_percent": vram_percent,
                    "temperature": None,  # Not available via torch.cuda
                    "utilization": None,  # Not available via torch.cuda
                })
            except Exception:  # noqa: BLE001, PERF203
                logger.debug("Failed to read GPU %d via torch.cuda", i)

        return gpus

    # ------------------------------------------------------------------
    # Static GPU info
    # ------------------------------------------------------------------

    def _get_gpu_static_info(self) -> list[dict]:
        """Return static GPU information (name, total VRAM)."""
        if self._ensure_nvml():
            try:
                import pynvml

                device_count = pynvml.nvmlDeviceGetCount()
                gpus: list[dict] = []
                for i in range(device_count):
                    handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                    name = pynvml.nvmlDeviceGetName(handle)
                    if isinstance(name, bytes):
                        name = name.decode("utf-8")
                    mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                    gpus.append({
                        "index": i,
                        "name": name,
                        "vram_total_mb": round(mem_info.total / (1024 ** 2), 1),
                    })
                return gpus
            except Exception:  # noqa: BLE001
                pass

        # Fallback to torch.cuda
        try:
            import torch

            if not torch.cuda.is_available():
                return []

            gpus = []
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                gpus.append({
                    "index": i,
                    "name": props.name,
                    "vram_total_mb": round(props.total_mem / (1024 ** 2), 1),
                })
            return gpus
        except Exception:  # noqa: BLE001
            return []
