"""
Singleton service that reads TensorBoard event files and exposes scalar data.

Uses tensorboard's EventAccumulator when available, with a graceful fallback
that returns an empty result set if the tensorboard package is not installed.
"""

import logging
import os
import threading
from pathlib import Path

from web.backend.services._singleton import SingletonMixin

logger = logging.getLogger(__name__)

# Graceful import — tensorboard may not be installed in every environment.
try:
    from tensorboard.backend.event_processing.event_accumulator import EventAccumulator

    _HAS_TENSORBOARD = True
except ImportError:
    _HAS_TENSORBOARD = False
    logger.warning(
        "tensorboard package not found. TensorBoard tab will return empty data. "
        "Install with: pip install tensorboard"
    )


class TensorboardService(SingletonMixin):
    """
    Thread-safe singleton that reads TensorBoard event files from a
    configurable log directory.

    Supports listing runs (subdirectories), listing scalar tags per run,
    and returning scalar data with optional incremental reads.
    """

    def __init__(self) -> None:
        self._accumulators: dict[str, "EventAccumulator"] = {}
        self._accumulator_lock = threading.Lock()

    # ------------------------------------------------------------------
    # Log directory resolution
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_log_dir(log_dir: str | None = None) -> str:
        """
        Resolve the TensorBoard log directory.

        If *log_dir* is given explicitly, use it.  Otherwise, read the
        workspace_dir from the current config and append the standard
        ``run/tensorboard`` suffix.
        """
        if log_dir:
            return log_dir

        from web.backend.services.config_service import ConfigService

        config_service = ConfigService.get_instance()
        workspace_dir = config_service.config.workspace_dir or "workspace"
        return os.path.join(workspace_dir, "run", "tensorboard")

    # ------------------------------------------------------------------
    # Run enumeration
    # ------------------------------------------------------------------

    def list_runs(self, log_dir: str | None = None) -> list[str]:
        """
        Return sorted list of training run names (subdirectory names)
        under the tensorboard log directory.
        """
        resolved = self._resolve_log_dir(log_dir)
        if not os.path.isdir(resolved):
            return []

        runs: list[str] = []
        for entry in os.scandir(resolved):
            if entry.is_dir():
                runs.append(entry.name)

        runs.sort(reverse=True)  # Most recent first (timestamps sort naturally)
        return runs

    # ------------------------------------------------------------------
    # EventAccumulator management
    # ------------------------------------------------------------------

    def _get_accumulator(self, run_dir: str) -> "EventAccumulator | None":
        """
        Return (and cache) an EventAccumulator for the given run directory.

        The accumulator is reloaded each time to pick up new events.
        """
        if not _HAS_TENSORBOARD:
            return None

        with self._accumulator_lock:
            if run_dir not in self._accumulators:
                acc = EventAccumulator(run_dir)
                acc.Reload()
                self._accumulators[run_dir] = acc
            else:
                # Reload to pick up new events since last call
                self._accumulators[run_dir].Reload()

            return self._accumulators[run_dir]

    def _run_path(self, run_name: str, log_dir: str | None = None) -> str:
        """Build the full path to a specific run directory."""
        resolved = self._resolve_log_dir(log_dir)
        return os.path.join(resolved, run_name)

    # ------------------------------------------------------------------
    # Scalar data access
    # ------------------------------------------------------------------

    def list_tags(self, run_name: str, log_dir: str | None = None) -> list[str]:
        """Return all scalar tag names for a given run."""
        run_path = self._run_path(run_name, log_dir)
        if not os.path.isdir(run_path):
            return []

        acc = self._get_accumulator(run_path)
        if acc is None:
            return []

        tags = acc.Tags()
        return sorted(tags.get("scalars", []))

    def get_scalars(
        self,
        run_name: str,
        tag: str,
        after_step: int = 0,
        log_dir: str | None = None,
    ) -> list[dict]:
        """
        Return scalar data points for a given run and tag.

        Each data point is ``{"wall_time": float, "step": int, "value": float}``.

        If *after_step* > 0, only data points with step > after_step are
        returned (for incremental polling).
        """
        run_path = self._run_path(run_name, log_dir)
        if not os.path.isdir(run_path):
            return []

        acc = self._get_accumulator(run_path)
        if acc is None:
            return []

        try:
            events = acc.Scalars(tag)
        except KeyError:
            return []

        result: list[dict] = []
        for event in events:
            if event.step > after_step:
                result.append(
                    {
                        "wall_time": event.wall_time,
                        "step": event.step,
                        "value": event.value,
                    }
                )

        return result

    # ------------------------------------------------------------------
    # Cache invalidation
    # ------------------------------------------------------------------

    def clear_cache(self, run_name: str | None = None, log_dir: str | None = None) -> None:
        """
        Clear cached EventAccumulator(s).

        If *run_name* is given, only that run's cache is cleared.
        Otherwise all cached accumulators are dropped.
        """
        with self._accumulator_lock:
            if run_name:
                run_path = self._run_path(run_name, log_dir)
                self._accumulators.pop(run_path, None)
            else:
                self._accumulators.clear()
