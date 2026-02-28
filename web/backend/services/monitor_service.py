import logging
import threading
from contextlib import suppress

from web.backend.services._singleton import SingletonMixin

import psutil

logger = logging.getLogger(__name__)


class MonitorService(SingletonMixin):

    def __init__(self) -> None:
        self._nvml_initialized: bool = False
        self._nvml_available: bool = False
        self._nvml_init_lock = threading.Lock()

        # First cpu_percent() call always returns 0.0; prime it here
        psutil.cpu_percent(interval=None)

    def get_metrics(self) -> dict:
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
        mem = psutil.virtual_memory()
        info: dict = {
            "cpu_count": psutil.cpu_count(logical=True),
            "cpu_count_physical": psutil.cpu_count(logical=False),
            "ram_total_gb": round(mem.total / (1024 ** 3), 2),
            "gpus": [],
        }

        try:
            gpu_info = self._get_gpu_static_info()
            info["gpus"] = gpu_info
        except Exception:  # noqa: BLE001
            pass

        return info

    def _ensure_nvml(self) -> bool:
        if self._nvml_initialized:
            return self._nvml_available

        with self._nvml_init_lock:
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

    def _get_gpu_metrics(self) -> list[dict]:
        if self._ensure_nvml():
            try:
                return self._get_gpu_metrics_nvml()
            except Exception:  # noqa: BLE001
                logger.debug("pynvml metrics failed, trying torch.cuda fallback")

        try:
            return self._get_gpu_metrics_torch()
        except Exception:  # noqa: BLE001
            pass

        return []

    def _get_gpu_metrics_nvml(self) -> list[dict]:
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

                temperature: float | None = None
                with suppress(Exception):
                    temperature = float(pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))

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
        import torch

        if not torch.cuda.is_available():
            return []

        device_count = torch.cuda.device_count()
        gpus: list[dict] = []

        for i in range(device_count):
            try:
                name = torch.cuda.get_device_name(i)
                mem_allocated = torch.cuda.memory_allocated(i)
                mem_total = torch.cuda.get_device_properties(i).total_memory
                vram_used_mb = round(mem_allocated / (1024 ** 2), 1)
                vram_total_mb = round(mem_total / (1024 ** 2), 1)
                vram_percent = round((mem_allocated / mem_total) * 100, 1) if mem_total > 0 else 0.0

                gpus.append({
                    "index": i,
                    "name": name,
                    "vram_used_mb": vram_used_mb,
                    "vram_total_mb": vram_total_mb,
                    "vram_percent": vram_percent,
                    "temperature": None,
                    "utilization": None,
                })
            except Exception:  # noqa: BLE001, PERF203
                logger.debug("Failed to read GPU %d via torch.cuda", i)

        return gpus

    def _get_gpu_static_info(self) -> list[dict]:
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
                    "vram_total_mb": round(props.total_memory / (1024 ** 2), 1),
                })
            return gpus
        except Exception:  # noqa: BLE001
            return []
