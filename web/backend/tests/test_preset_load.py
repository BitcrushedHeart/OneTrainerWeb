import json
import os
import sys

import pytest

# Ensure project root is importable
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

# optimizer_util transitively imports torch and other ML libraries.
# Skip this entire module when the ML stack is not installed.
torch = pytest.importorskip("torch", reason="Full ML stack (torch) required for optimizer tests")

from modules.util.config.TrainConfig import TrainConfig, TrainOptimizerConfig
from modules.util.enum.Optimizer import Optimizer
from modules.util.optimizer_util import (
    OPTIMIZER_DEFAULT_PARAMETERS,
    change_optimizer,
    update_optimizer_config,
)

# Discover presets
PRESETS_DIR = os.path.join(PROJECT_ROOT, "training_presets")
PRESET_FILES = sorted(f for f in os.listdir(PRESETS_DIR) if f.endswith(".json"))


def _load_preset_json(filename: str) -> dict:
    path = os.path.join(PRESETS_DIR, filename)
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


# 1. Preset loading -- no exceptions

class TestPresetLoad:
    @pytest.mark.parametrize("preset_filename", PRESET_FILES, ids=PRESET_FILES)
    def test_load_preset_no_exception(self, preset_filename: str):
        raw = _load_preset_json(preset_filename)

        if preset_filename.startswith("#"):
            raw["__version"] = TrainConfig.default_values().config_version

        config = TrainConfig.default_values()
        config.from_dict(raw)

        # Basic sanity: the config should still serialise without error
        d = config.to_dict()
        assert isinstance(d, dict)
        assert "__version" in d

    @pytest.mark.parametrize("preset_filename", PRESET_FILES, ids=PRESET_FILES)
    def test_load_preset_produces_valid_model_type(self, preset_filename: str):
        from modules.util.enum.ModelType import ModelType

        raw = _load_preset_json(preset_filename)
        if preset_filename.startswith("#"):
            raw["__version"] = TrainConfig.default_values().config_version

        config = TrainConfig.default_values()
        config.from_dict(raw)
        assert isinstance(config.model_type, ModelType)

    @pytest.mark.parametrize("preset_filename", PRESET_FILES, ids=PRESET_FILES)
    def test_load_preset_produces_valid_training_method(self, preset_filename: str):
        from modules.util.enum.TrainingMethod import TrainingMethod

        raw = _load_preset_json(preset_filename)
        if preset_filename.startswith("#"):
            raw["__version"] = TrainConfig.default_values().config_version

        config = TrainConfig.default_values()
        config.from_dict(raw)
        assert isinstance(config.training_method, TrainingMethod)

    @pytest.mark.parametrize("preset_filename", PRESET_FILES, ids=PRESET_FILES)
    def test_load_preset_and_change_optimizer_no_exception(self, preset_filename: str):
        raw = _load_preset_json(preset_filename)
        if preset_filename.startswith("#"):
            raw["__version"] = TrainConfig.default_values().config_version

        config = TrainConfig.default_values()
        config.from_dict(raw)

        # Apply the change_optimizer flow (same as ConfigService.load_preset)
        optimizer_config = change_optimizer(config)
        config.optimizer.from_dict(optimizer_config.to_dict())

        d = config.to_dict()
        assert isinstance(d, dict)


# 2. Optimizer switching

# Common optimizers to test -- selected to cover different categories
COMMON_OPTIMIZERS = [
    Optimizer.ADAMW,
    Optimizer.ADAFACTOR,
    Optimizer.PRODIGY,
    Optimizer.SGD,
    Optimizer.ADAM,
    Optimizer.LION,
    Optimizer.DADAPT_ADAM,
    Optimizer.SCHEDULE_FREE_ADAMW,
    Optimizer.PRODIGY_PLUS_SCHEDULE_FREE,
]


class TestOptimizerSwitch:
    @pytest.mark.parametrize(
        "optimizer",
        COMMON_OPTIMIZERS,
        ids=[o.name for o in COMMON_OPTIMIZERS],
    )
    def test_change_optimizer_applies_defaults(self, optimizer: Optimizer):
        config = TrainConfig.default_values()
        config.optimizer.optimizer = optimizer

        result = change_optimizer(config)
        assert isinstance(result, TrainOptimizerConfig)
        assert result.optimizer == optimizer

    @pytest.mark.parametrize(
        "optimizer",
        COMMON_OPTIMIZERS,
        ids=[o.name for o in COMMON_OPTIMIZERS],
    )
    def test_change_optimizer_serializes(self, optimizer: Optimizer):
        config = TrainConfig.default_values()
        config.optimizer.optimizer = optimizer

        result = change_optimizer(config)
        config.optimizer.from_dict(result.to_dict())

        d = config.to_dict()
        assert isinstance(d, dict)
        # The optimizer sub-dict should name the optimizer we set
        opt_name = d["optimizer"]["optimizer"]
        assert optimizer.name in opt_name or optimizer.value in opt_name

    @pytest.mark.parametrize(
        "optimizer",
        list(OPTIMIZER_DEFAULT_PARAMETERS.keys()),
        ids=[o.name for o in OPTIMIZER_DEFAULT_PARAMETERS],
    )
    def test_all_optimizers_with_defaults(self, optimizer: Optimizer):
        config = TrainConfig.default_values()
        config.optimizer.optimizer = optimizer
        result = change_optimizer(config)
        assert result.optimizer == optimizer

    def test_switch_and_switch_back_preserves_values(self):
        config = TrainConfig.default_values()

        # Start with ADAMW
        config.optimizer.optimizer = Optimizer.ADAMW
        adamw_config = change_optimizer(config)
        config.optimizer.from_dict(adamw_config.to_dict())

        # Modify a value to make it distinguishable from defaults
        config.optimizer.weight_decay = 0.42

        # Cache the current ADAMW settings
        update_optimizer_config(config)

        # Switch to SGD
        config.optimizer.optimizer = Optimizer.SGD
        sgd_config = change_optimizer(config)
        config.optimizer.from_dict(sgd_config.to_dict())
        assert config.optimizer.optimizer == Optimizer.SGD

        # Switch back to ADAMW
        config.optimizer.optimizer = Optimizer.ADAMW
        restored_config = change_optimizer(config)
        config.optimizer.from_dict(restored_config.to_dict())

        assert config.optimizer.optimizer == Optimizer.ADAMW
        assert config.optimizer.weight_decay == 0.42, (
            "Switching back to ADAMW should restore the cached weight_decay=0.42"
        )

    def test_switch_optimizer_without_prior_cache(self):
        config = TrainConfig.default_values()
        config.optimizer_defaults = {}

        config.optimizer.optimizer = Optimizer.PRODIGY
        result = change_optimizer(config)
        config.optimizer.from_dict(result.to_dict())

        # Verify the PRODIGY defaults got applied
        assert config.optimizer.optimizer == Optimizer.PRODIGY
        expected = OPTIMIZER_DEFAULT_PARAMETERS[Optimizer.PRODIGY]
        if "d0" in expected and expected["d0"] is not None:
            assert config.optimizer.d0 == expected["d0"]

    def test_optimizer_defaults_cache_multiple_optimizers(self):
        config = TrainConfig.default_values()

        # Configure ADAMW with custom weight_decay
        config.optimizer.optimizer = Optimizer.ADAMW
        adamw_config = change_optimizer(config)
        config.optimizer.from_dict(adamw_config.to_dict())
        config.optimizer.weight_decay = 0.11
        update_optimizer_config(config)

        # Configure SGD with custom momentum
        config.optimizer.optimizer = Optimizer.SGD
        sgd_config = change_optimizer(config)
        config.optimizer.from_dict(sgd_config.to_dict())
        config.optimizer.momentum = 0.77
        update_optimizer_config(config)

        # Switch to ADAMW and verify
        config.optimizer.optimizer = Optimizer.ADAMW
        restored = change_optimizer(config)
        config.optimizer.from_dict(restored.to_dict())
        assert config.optimizer.weight_decay == 0.11

        # Switch to SGD and verify
        config.optimizer.optimizer = Optimizer.SGD
        restored = change_optimizer(config)
        config.optimizer.from_dict(restored.to_dict())
        assert config.optimizer.momentum == 0.77


# 3. Optimizer default parameters coverage

class TestOptimizerDefaults:
    def test_all_optimizers_have_defaults(self):
        for opt_key in OPTIMIZER_DEFAULT_PARAMETERS:
            assert isinstance(opt_key, Optimizer), (
                f"Key {opt_key!r} in OPTIMIZER_DEFAULT_PARAMETERS is not an Optimizer enum"
            )

    def test_default_params_are_valid_config_fields(self):
        reference = TrainOptimizerConfig.default_values()
        valid_fields = set(reference.types.keys())

        for optimizer, defaults in OPTIMIZER_DEFAULT_PARAMETERS.items():
            for param_name in defaults:
                assert param_name in valid_fields, (
                    f"Optimizer {optimizer.name} has default param "
                    f"'{param_name}' which is not a TrainOptimizerConfig field"
                )

    @pytest.mark.parametrize(
        "optimizer",
        list(OPTIMIZER_DEFAULT_PARAMETERS.keys()),
        ids=[o.name for o in OPTIMIZER_DEFAULT_PARAMETERS],
    )
    def test_optimizer_defaults_loadable(self, optimizer: Optimizer):
        defaults = OPTIMIZER_DEFAULT_PARAMETERS[optimizer]
        config = TrainOptimizerConfig.default_values()
        config.from_dict(defaults)
        config.optimizer = optimizer
        d = config.to_dict()
        assert d["optimizer"] == f"Optimizer.{optimizer.value}"


# 4. Version migration tests

class TestVersionMigration:
    def test_version_0_migration(self):
        # Start with a version-0 style config that has enough fields
        # to survive all subsequent migrations (0-9).
        # Migration 0: moves optimizer_* to sub-dict
        # Migration 1: creates unet/prior/text_encoder/etc sub-dicts
        #   from prefixed keys (unet_weight_dtype, etc.)
        # Migration 8: copies prior to transformer (needs model_type)
        # Migration 9: replaces weight_dtype NONE in model parts,
        #   removes top-level weight_dtype
        v0_data = {
            "__version": 0,
            "training_method": "FINE_TUNE",
            "model_type": "STABLE_DIFFUSION_15",
            "base_model_name": "test-model",
            "optimizer": "ADAMW",
            "optimizer_weight_decay": 0.01,
            "optimizer_beta1": 0.9,
            "optimizer_beta2": 0.999,
            "optimizer_eps": 1e-8,
            "weight_dtype": "FLOAT_32",
            # Model part weight dtypes needed by migration 1 -> 9
            "unet_weight_dtype": "FLOAT_32",
            "text_encoder_weight_dtype": "FLOAT_32",
            "text_encoder_2_weight_dtype": "FLOAT_32",
            "vae_weight_dtype": "FLOAT_32",
            "effnet_encoder_weight_dtype": "FLOAT_32",
            "decoder_weight_dtype": "FLOAT_32",
            "decoder_text_encoder_weight_dtype": "FLOAT_32",
            "decoder_vqgan_weight_dtype": "FLOAT_32",
            "prior_weight_dtype": "FLOAT_32",
            "gradient_checkpointing": True,
        }

        config = TrainConfig.default_values()
        config.from_dict(v0_data)

        d = config.to_dict()
        assert d["__version"] == 10
        assert isinstance(d, dict)

    def test_current_version_no_migration(self):
        config = TrainConfig.default_values()
        raw = config.to_dict()
        assert raw["__version"] == 10

        # Normalize through one from_dict pass
        config_norm = TrainConfig.default_values()
        config_norm.from_dict(raw)
        d = config_norm.to_dict()
        assert d["__version"] == 10

        # Load it back -- no migration should run, result should be identical
        config2 = TrainConfig.default_values()
        config2.from_dict(d)
        d2 = config2.to_dict()
        assert d2["__version"] == 10
        assert d == d2

    def test_missing_version_treated_as_0(self):
        data_no_version = {
            "training_method": "FINE_TUNE",
            "model_type": "STABLE_DIFFUSION_15",
            "optimizer": "ADAMW",
            "weight_dtype": "FLOAT_32",
            # Model part weight dtypes for migration 1 -> 9
            "unet_weight_dtype": "FLOAT_32",
            "text_encoder_weight_dtype": "FLOAT_32",
            "text_encoder_2_weight_dtype": "FLOAT_32",
            "vae_weight_dtype": "FLOAT_32",
            "effnet_encoder_weight_dtype": "FLOAT_32",
            "decoder_weight_dtype": "FLOAT_32",
            "decoder_text_encoder_weight_dtype": "FLOAT_32",
            "decoder_vqgan_weight_dtype": "FLOAT_32",
            "prior_weight_dtype": "FLOAT_32",
            "gradient_checkpointing": True,
        }

        config = TrainConfig.default_values()
        config.from_dict(data_no_version)

        d = config.to_dict()
        assert d["__version"] == 10

    def test_migration_5_save_after_to_save_every(self):
        # Include fields needed by later migrations (8 needs model_type
        # and prior; 9 needs weight_dtype on model parts and pops
        # top-level weight_dtype).
        data = {
            "__version": 5,
            "save_after": 42,
            "save_after_unit": "MINUTE",
            "model_type": "STABLE_DIFFUSION_15",
            "weight_dtype": "FLOAT_32",
            "prior": {"weight_dtype": "FLOAT_32"},
            "unet": {"weight_dtype": "FLOAT_32"},
            "text_encoder": {"weight_dtype": "FLOAT_32"},
            "text_encoder_2": {"weight_dtype": "FLOAT_32"},
            "text_encoder_3": {"weight_dtype": "FLOAT_32"},
            "text_encoder_4": {"weight_dtype": "FLOAT_32"},
            "vae": {"weight_dtype": "FLOAT_32"},
            "effnet_encoder": {"weight_dtype": "FLOAT_32"},
            "decoder": {"weight_dtype": "FLOAT_32"},
            "decoder_text_encoder": {"weight_dtype": "FLOAT_32"},
            "decoder_vqgan": {"weight_dtype": "FLOAT_32"},
        }

        config = TrainConfig.default_values()
        config.from_dict(data)

        assert config.save_every == 42

    def test_migration_4_gradient_checkpointing_bool_to_enum(self):
        from modules.util.enum.GradientCheckpointingMethod import GradientCheckpointingMethod

        # Version 4 data with bool gradient_checkpointing.
        # Include fields required by later migrations (5-9).
        # Migration 9 pops top-level weight_dtype.
        data_on = {
            "__version": 4,
            "gradient_checkpointing": True,
            "model_type": "STABLE_DIFFUSION_15",
            "weight_dtype": "FLOAT_32",
            "prior": {"weight_dtype": "FLOAT_32"},
            "unet": {"weight_dtype": "FLOAT_32"},
            "text_encoder": {"weight_dtype": "FLOAT_32"},
            "text_encoder_2": {"weight_dtype": "FLOAT_32"},
            "text_encoder_3": {"weight_dtype": "FLOAT_32"},
            "text_encoder_4": {"weight_dtype": "FLOAT_32"},
            "vae": {"weight_dtype": "FLOAT_32"},
            "effnet_encoder": {"weight_dtype": "FLOAT_32"},
            "decoder": {"weight_dtype": "FLOAT_32"},
            "decoder_text_encoder": {"weight_dtype": "FLOAT_32"},
            "decoder_vqgan": {"weight_dtype": "FLOAT_32"},
        }

        config = TrainConfig.default_values()
        config.from_dict(data_on)
        assert config.gradient_checkpointing == GradientCheckpointingMethod.ON

    def test_migration_7_lora_layers_renamed(self):
        # Include fields required by later migrations (8 and 9).
        # Migration 9 pops top-level weight_dtype.
        data = {
            "__version": 7,
            "lora_layers": "attn,mlp",
            "lora_layer_preset": "attn-mlp",
            "lora_layers_regex": True,
            "model_type": "STABLE_DIFFUSION_15",
            "weight_dtype": "FLOAT_32",
            "prior": {"weight_dtype": "FLOAT_32"},
            "unet": {"weight_dtype": "FLOAT_32"},
            "text_encoder": {"weight_dtype": "FLOAT_32"},
            "text_encoder_2": {"weight_dtype": "FLOAT_32"},
            "text_encoder_3": {"weight_dtype": "FLOAT_32"},
            "text_encoder_4": {"weight_dtype": "FLOAT_32"},
            "vae": {"weight_dtype": "FLOAT_32"},
            "effnet_encoder": {"weight_dtype": "FLOAT_32"},
            "decoder": {"weight_dtype": "FLOAT_32"},
            "decoder_text_encoder": {"weight_dtype": "FLOAT_32"},
            "decoder_vqgan": {"weight_dtype": "FLOAT_32"},
        }

        config = TrainConfig.default_values()
        config.from_dict(data)

        assert config.layer_filter == "attn,mlp"
        assert config.layer_filter_preset == "attn-mlp"
        assert config.layer_filter_regex is True

    def test_sequential_migration_coverage(self):
        config = TrainConfig.default_values()
        assert config.config_version == 10

        for version in range(10):
            assert version in config.config_migrations, (
                f"Missing migration handler for version {version}"
            )


# 5. Full flow: preset load -> optimizer switch -> serialize

class TestFullPresetFlow:
    @pytest.mark.parametrize("preset_filename", PRESET_FILES[:10], ids=PRESET_FILES[:10])
    def test_full_load_flow(self, preset_filename: str):
        raw = _load_preset_json(preset_filename)

        default_config = TrainConfig.default_values()
        if preset_filename.startswith("#"):
            raw["__version"] = default_config.config_version

        loaded_config = default_config.from_dict(raw).to_unpacked_config()

        # Create the "main" config and apply loaded
        main_config = TrainConfig.default_values()
        main_config.from_dict(loaded_config.to_dict())

        # Resolve optimizer
        optimizer_config = change_optimizer(main_config)
        main_config.optimizer.from_dict(optimizer_config.to_dict())

        # Serialize
        d = main_config.to_dict()
        assert isinstance(d, dict)
        assert d["__version"] == 10

        # One more round-trip to prove stability
        config2 = TrainConfig.default_values()
        config2.from_dict(d)
        d2 = config2.to_dict()

        # The only acceptable difference might be optimizer_defaults
        # which gets populated during the flow.  Compare the top-level
        # structure at minimum.
        assert set(d.keys()) == set(d2.keys()), (
            f"Key sets differ after full flow for '{preset_filename}'"
        )

    def test_to_unpacked_config_strips_concepts_and_samples(self):
        config = TrainConfig.default_values()
        unpacked = config.to_unpacked_config()
        assert unpacked.concepts is None
        assert unpacked.samples is None


# 6. Edge cases

class TestEdgeCases:
    def test_empty_dict_loads_without_error(self):
        config = TrainConfig.default_values()
        config.from_dict({})
        d = config.to_dict()
        assert isinstance(d, dict)

    def test_extra_unknown_keys_ignored(self):
        config = TrainConfig.default_values()
        config.from_dict({"__version": 10, "totally_fake_key": "whatever"})
        d = config.to_dict()
        assert "totally_fake_key" not in d

    def test_none_nullable_fields_survive_roundtrip(self):
        config = TrainConfig.default_values()
        config.custom_learning_rate_scheduler = None
        config.clip_grad_norm = None

        d = config.to_dict()
        assert d["custom_learning_rate_scheduler"] is None
        assert d["clip_grad_norm"] is None

        config2 = TrainConfig.default_values()
        config2.from_dict(d)
        assert config2.custom_learning_rate_scheduler is None
        assert config2.clip_grad_norm is None

    def test_float_inf_roundtrip(self):
        config = TrainConfig.default_values()
        config.optimizer.optimizer = Optimizer.PRODIGY

        optimizer_config = change_optimizer(config)
        config.optimizer.from_dict(optimizer_config.to_dict())

        # Prodigy has growth_rate=inf in its defaults
        d = config.to_dict()
        growth_val = d["optimizer"].get("growth_rate")
        # Should be serialised as the string "inf" (per BaseConfig.to_dict)
        assert growth_val == "inf" or growth_val == float("inf"), (
            f"Expected 'inf' or float('inf'), got {growth_val!r}"
        )

        # Round-trip through JSON
        json_str = json.dumps(d)
        d2 = json.loads(json_str)

        config2 = TrainConfig.default_values()
        config2.from_dict(d2)
        assert config2.optimizer.growth_rate == float("inf")

    def test_empty_list_fields_roundtrip(self):
        config = TrainConfig.default_values()
        config.scheduler_params = []
        config.additional_embeddings = []

        d = config.to_dict()
        assert d["scheduler_params"] == []
        assert d["additional_embeddings"] == []

        config2 = TrainConfig.default_values()
        config2.from_dict(d)
        assert config2.scheduler_params == []
        assert config2.additional_embeddings == []
