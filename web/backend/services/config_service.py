"""
Singleton service holding the in-memory TrainConfig for the web UI session.

This service mirrors the config lifecycle from the legacy customtkinter GUI
(see modules/ui/TopBar.py) but exposes it as a stateless API-friendly layer.
"""

import json
import logging
import os
import threading
from contextlib import suppress

from modules.util.config.SecretsConfig import SecretsConfig
from modules.util.config.TrainConfig import TrainConfig

from web.backend.services._singleton import SingletonMixin

logger = logging.getLogger(__name__)


class ConfigService(SingletonMixin):
    """
    Thread-safe singleton that owns the authoritative TrainConfig instance.

    All REST/WebSocket handlers should go through this service rather than
    constructing TrainConfig objects directly.
    """

    _validate_lock: threading.Lock = threading.Lock()

    def __init__(self) -> None:
        self.config: TrainConfig = TrainConfig.default_values()
        # Normalize the default config so that to_dict() is idempotent from
        # the very first GET.  Some upstream sub-configs have mismatched
        # default values vs. declared types (e.g. CloudSecretsConfig.port is
        # typed as str but defaults to int 0).  A from_dict(to_dict()) cycle
        # forces every value through the type coercion path in from_dict,
        # making the serialised form stable for round-trip tests.
        self.config.from_dict(self.config.to_dict())
        self._config_lock = threading.Lock()

    # ------------------------------------------------------------------
    # Basic CRUD
    # ------------------------------------------------------------------

    def get_config_dict(self) -> dict:
        """Return the current config serialised as a plain dict."""
        with self._config_lock:
            return self.config.to_dict()

    def update_config(self, data: dict) -> dict:
        """
        Apply a partial update to the current config and return the full
        updated config dict.

        ``from_dict`` silently drops keys that do not match any declared
        field, so callers can safely send partial payloads.

        We inject ``__version`` set to the current schema version so that
        ``from_dict`` skips all config migrations.  Migrations assume the
        dict is a *complete* config snapshot from an older schema version;
        running them on a sparse partial-update dict causes KeyErrors
        (e.g. migration_8 accesses ``data["model_type"]`` unconditionally).
        """
        with self._config_lock:
            # Partial updates from the frontend omit __version. Injecting the current
            # version prevents from_dict() from running migrations on sparse payloads,
            # which would crash on missing keys (e.g., migration 8 accesses model_type).
            if "__version" not in data:
                data["__version"] = self.config.config_version
            self.config.from_dict(data)
            return self.config.to_dict()

    def get_defaults(self) -> dict:
        """Return a freshly-constructed default TrainConfig as a dict."""
        return TrainConfig.default_values().to_dict()

    # ------------------------------------------------------------------
    # Preset I/O  (mirrors TopBar.__load_current_config)
    # ------------------------------------------------------------------

    def load_preset(self, preset_path: str) -> dict:
        """
        Load a preset JSON file into the in-memory config.

        The algorithm reproduces ``TopBar.__load_current_config`` exactly:
        1. Read the JSON from *preset_path*.
        2. For built-in presets (basename starts with ``#`` but is not
           ``#.json``), force ``__version`` to the current schema version
           so that no migrations run on curated presets.
        3. Create a fresh ``default_values()`` config, apply ``from_dict()``,
           then ``to_unpacked_config()`` to strip inline concepts/samples.
        4. Load secrets from ``secrets.json`` if it exists.
        5. Push the loaded config into ``self.config`` via ``from_dict()``.
        6. Call ``change_optimizer()`` to apply per-optimizer defaults.
        7. Return the full config dict.
        """
        with self._config_lock:
            basename = os.path.basename(preset_path)
            is_built_in_preset = basename.startswith("#") and basename != "#.json"

            with open(preset_path, "r", encoding="utf-8") as fh:
                loaded_dict: dict = json.load(fh)

            default_config = TrainConfig.default_values()

            if is_built_in_preset:
                # Built-in presets are always written at the latest version.
                loaded_dict["__version"] = default_config.config_version

            loaded_config = default_config.from_dict(loaded_dict).to_unpacked_config()

            # Attempt to load secrets the same way the legacy GUI does.
            with suppress(FileNotFoundError):
                with open("secrets.json", "r", encoding="utf-8") as fh:
                    secrets_dict = json.load(fh)
                    loaded_config.secrets = SecretsConfig.default_values().from_dict(secrets_dict)

            # Apply to the authoritative config.
            self.config.from_dict(loaded_config.to_dict())

            # Resolve optimizer defaults for the current optimizer selection.
            from modules.util.optimizer_util import change_optimizer

            optimizer_config = change_optimizer(self.config)
            self.config.optimizer.from_dict(optimizer_config.to_dict())

            return self.config.to_dict()

    def save_preset(self, path: str) -> None:
        """
        Persist the current config to *path* using
        ``to_settings_dict(secrets=False)``.

        Concepts and samples are excluded (they live in separate files).
        Secrets are never written to preset files.
        """
        with self._config_lock:
            settings_dict = self.config.to_settings_dict(secrets=False)

        # Ensure the parent directory exists.
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        with open(path, "w", encoding="utf-8") as fh:
            json.dump(settings_dict, fh, indent=4)

    # ------------------------------------------------------------------
    # Optimizer switching
    # ------------------------------------------------------------------

    def change_optimizer(self, new_optimizer: str) -> dict:
        """
        Switch to *new_optimizer*, caching the current optimizer settings
        first so the user can switch back without losing tweaks.

        Steps:
        1. Persist the current optimizer params into
           ``config.optimizer_defaults`` via ``update_optimizer_config``.
        2. Set the new optimizer enum on ``config.optimizer.optimizer``.
        3. Call ``change_optimizer()`` from ``optimizer_util`` which
           loads defaults then overlays any previously-cached settings.
        4. Push the resolved optimizer config back into ``self.config``.
        5. Return the full config dict.
        """
        with self._config_lock:
            # Import the enum dynamically to resolve the string value.
            from modules.util.enum.Optimizer import Optimizer
            from modules.util.optimizer_util import change_optimizer, update_optimizer_config

            # 1. Cache the *current* optimizer settings before we switch.
            update_optimizer_config(self.config)

            # 2. Set the new optimizer on the config.
            new_opt_enum = Optimizer[new_optimizer]
            self.config.optimizer.optimizer = new_opt_enum

            # 3. Resolve defaults (+ any cached user overrides).
            optimizer_config = change_optimizer(self.config)

            # 4. Apply back.
            self.config.optimizer.from_dict(optimizer_config.to_dict())

            return self.config.to_dict()

    # ------------------------------------------------------------------
    # Training handoff
    # ------------------------------------------------------------------

    def get_config_for_training(self) -> TrainConfig:
        """
        Return a deep copy of the current config, safe to hand off to a
        training thread without worrying about concurrent mutations.
        """
        with self._config_lock:
            config_dict = self.config.to_dict()

        # Rebuild from dict on a fresh default so all sub-configs are
        # independent objects (deepcopy alone does not always work with
        # BaseConfig's internal references).
        train_config = TrainConfig.default_values()
        train_config.from_dict(config_dict)
        return train_config

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate_config(self, data: dict) -> dict:
        """
        Validate a full or partial config dict against TrainConfig without
        modifying the in-memory config.

        Creates a fresh default config, injects ``__version`` to prevent
        migration issues (same pattern as ``update_config``), then attempts
        ``from_dict()``.

        Because ``BaseConfig.from_dict()`` silently swallows type-coercion
        failures (printing "Could not set <field> as <value>" to stdout),
        we capture stdout during the call and treat those messages as
        validation errors.

        Returns:
            ``{"valid": True}`` on success, or
            ``{"valid": False, "errors": [...]}`` on failure.
        """
        import io
        import sys

        # Inject __version so migrations don't fire on partial payloads.
        validation_data = dict(data)
        if "__version" not in validation_data:
            validation_data["__version"] = TrainConfig.default_values().config_version

        errors: list[str] = []

        # Capture stdout to detect silent from_dict failures.
        # A lock is required because redirecting sys.stdout is process-global;
        # without it, concurrent validate calls would interleave output and
        # return incorrect error messages.
        with self._validate_lock:
            captured = io.StringIO()
            old_stdout = sys.stdout
            try:
                sys.stdout = captured
                test_config = TrainConfig.default_values()
                test_config.from_dict(validation_data)
            except Exception as exc:
                errors.append(str(exc))
            finally:
                sys.stdout = old_stdout

            # Parse "Could not set <field> as <value>" messages from from_dict.
            output = captured.getvalue()
            for line in output.splitlines():
                line = line.strip()
                if line:
                    errors.append(line)

        if errors:
            return {"valid": False, "errors": errors}
        return {"valid": True}

    # ------------------------------------------------------------------
    # Export / pack
    # ------------------------------------------------------------------

    def export_config(self) -> dict:
        """
        Export the config via ``to_pack_dict(secrets=False)``.

        This bundles concepts and samples inline (reading them from their
        respective JSON files if they are not already loaded) — suitable
        for sharing a fully self-contained config snapshot.
        """
        with self._config_lock:
            return self.config.to_pack_dict(secrets=False)
