"""
Service for loading and saving concept and sample definition files.

Concepts and samples are stored in separate JSON files (not inline in the
main TrainConfig). The default paths are ``training_concepts/concepts.json``
and ``training_samples/samples.json``, but users can point to arbitrary
locations via the config fields ``concept_file_name`` and
``sample_definition_file_name``.

Each JSON file contains a top-level array of objects.  On load we normalise
every entry through its ``default_values().from_dict()`` round-trip so that
missing fields are filled in and migrations are applied.
"""

import json
import logging
import os
from typing import Any

from modules.util.config.ConceptConfig import ConceptConfig
from modules.util.config.SampleConfig import SampleConfig

logger = logging.getLogger(__name__)


class ConceptService:
    """
    Stateless helper for concept and sample file I/O.

    Unlike ``ConfigService`` this is *not* a singleton — there is no shared
    mutable state.  Router code can instantiate it freely or keep one around
    as a dependency.
    """

    # ------------------------------------------------------------------
    # Generic private helpers
    # ------------------------------------------------------------------

    def _load_list(self, file_path: str, config_class: Any) -> list[dict]:
        """
        Load a JSON array from *file_path* and round-trip each entry through
        ``config_class.default_values().from_dict()`` to apply migrations and
        fill missing fields.

        Raises ``FileNotFoundError`` if the file does not exist.
        """
        with open(file_path, "r", encoding="utf-8") as fh:
            raw_list: list[dict] = json.load(fh)

        return [config_class.default_values().from_dict(entry).to_dict() for entry in raw_list]

    def _save_list(self, file_path: str, items: list[dict], config_class: Any) -> None:
        """
        Round-trip each dict in *items* through ``config_class`` for
        normalisation, then write the resulting array to *file_path* as JSON.

        Parent directories are created if they do not already exist.
        """
        normalised = [config_class.default_values().from_dict(entry).to_dict() for entry in items]

        parent = os.path.dirname(file_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        with open(file_path, "w", encoding="utf-8") as fh:
            json.dump(normalised, fh, indent=4)

    # ------------------------------------------------------------------
    # Concepts
    # ------------------------------------------------------------------

    def load_concepts(self, file_path: str) -> list[dict]:
        """
        Load concepts from a JSON file and return them as a list of dicts.

        Each raw dict is round-tripped through
        ``ConceptConfig.default_values().from_dict()`` so that:
        * Schema migrations are applied.
        * Missing fields are filled with defaults.
        * The returned dicts are guaranteed to have a consistent shape.

        Raises ``FileNotFoundError`` if the file does not exist.
        """
        return self._load_list(file_path, ConceptConfig)

    def save_concepts(self, file_path: str, concepts: list[dict]) -> None:
        """
        Save a list of concept dicts to a JSON file.

        Each dict is round-tripped through ``ConceptConfig`` so that only
        recognised fields are persisted and enums are serialised correctly.

        Parent directories are created if they do not already exist.
        """
        self._save_list(file_path, concepts, ConceptConfig)

    # ------------------------------------------------------------------
    # Samples
    # ------------------------------------------------------------------

    def load_samples(self, file_path: str) -> list[dict]:
        """
        Load sample definitions from a JSON file and return them as a list
        of dicts.

        Each raw dict is round-tripped through
        ``SampleConfig.default_values().from_dict()`` for migration and
        default-filling.

        Raises ``FileNotFoundError`` if the file does not exist.
        """
        return self._load_list(file_path, SampleConfig)

    def save_samples(self, file_path: str, samples: list[dict]) -> None:
        """
        Save a list of sample definition dicts to a JSON file.

        Each dict is round-tripped through ``SampleConfig`` for
        normalisation.

        Parent directories are created if they do not already exist.
        """
        self._save_list(file_path, samples, SampleConfig)
