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
        with open(file_path, "r", encoding="utf-8") as fh:
            raw_list: list[dict] = json.load(fh)

        concepts: list[dict] = []
        for entry in raw_list:
            config = ConceptConfig.default_values().from_dict(entry)
            concepts.append(config.to_dict())
        return concepts

    def save_concepts(self, file_path: str, concepts: list[dict]) -> None:
        """
        Save a list of concept dicts to a JSON file.

        Each dict is round-tripped through ``ConceptConfig`` so that only
        recognised fields are persisted and enums are serialised correctly.

        Parent directories are created if they do not already exist.
        """
        normalised: list[dict] = []
        for entry in concepts:
            config = ConceptConfig.default_values().from_dict(entry)
            normalised.append(config.to_dict())

        parent = os.path.dirname(file_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        with open(file_path, "w", encoding="utf-8") as fh:
            json.dump(normalised, fh, indent=4)

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
        with open(file_path, "r", encoding="utf-8") as fh:
            raw_list: list[dict] = json.load(fh)

        samples: list[dict] = []
        for entry in raw_list:
            config = SampleConfig.default_values().from_dict(entry)
            samples.append(config.to_dict())
        return samples

    def save_samples(self, file_path: str, samples: list[dict]) -> None:
        """
        Save a list of sample definition dicts to a JSON file.

        Each dict is round-tripped through ``SampleConfig`` for
        normalisation.

        Parent directories are created if they do not already exist.
        """
        normalised: list[dict] = []
        for entry in samples:
            config = SampleConfig.default_values().from_dict(entry)
            normalised.append(config.to_dict())

        parent = os.path.dirname(file_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        with open(file_path, "w", encoding="utf-8") as fh:
            json.dump(normalised, fh, indent=4)
