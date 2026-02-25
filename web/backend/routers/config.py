from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from web.backend.services.config_service import ConfigService

router = APIRouter(prefix="/config", tags=["config"])


class ConfigUpdateRequest(BaseModel):
    """Partial config update. Any subset of TrainConfig fields."""
    model_config = {"extra": "allow"}


@router.get("")
def get_config() -> dict:
    """Return the current training configuration as a dictionary."""
    service = ConfigService.get_instance()
    return service.get_config_dict()


@router.put("")
def update_config(body: ConfigUpdateRequest) -> dict:
    """
    Update the current config with the provided fields.
    Returns the full updated config.
    """
    service = ConfigService.get_instance()
    try:
        return service.update_config(body.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/validate")
def validate_config(body: ConfigUpdateRequest) -> dict:
    """
    Validate a full or partial config dict against TrainConfig without
    persisting any changes.

    Returns ``{"valid": true}`` on success, or
    ``{"valid": false, "errors": [...]}`` on failure.
    """
    service = ConfigService.get_instance()
    return service.validate_config(body.model_dump())


@router.get("/defaults")
def get_defaults() -> dict:
    """Return the default TrainConfig values."""
    service = ConfigService.get_instance()
    return service.get_defaults()


@router.get("/schema")
def get_schema() -> dict:
    """
    Return field metadata derived from the config's types and nullables
    dictionaries. Each field entry includes its type name and whether it
    is nullable.
    """
    service = ConfigService.get_instance()
    config = service.config

    fields: dict[str, dict] = {}
    for name, var_type in config.types.items():
        type_name = getattr(var_type, "__name__", str(var_type))
        fields[name] = {
            "type": type_name,
            "nullable": config.nullables.get(name, False),
        }

    return {"fields": fields}


class ChangeOptimizerRequest(BaseModel):
    optimizer: str


@router.post("/change-optimizer")
def change_optimizer_endpoint(body: ChangeOptimizerRequest) -> dict:
    """
    Switch to a new optimizer, caching the current optimizer settings first.
    Returns the full updated config with per-optimizer defaults applied.
    """
    service = ConfigService.get_instance()
    try:
        return service.change_optimizer(body.optimizer)
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown optimizer: {body.optimizer}") from exc


@router.get("/optimizer-params")
def get_optimizer_params() -> dict:
    """
    Return per-optimizer parameter metadata.

    Returns a dict mapping each optimizer name to:
      - keys: ordered list of parameter names for that optimizer
      - defaults: dict of default values
    Plus a shared ``detail_map`` with titles, tooltips, and types.
    """
    from modules.util.enum.Optimizer import Optimizer
    from modules.util.optimizer_util import OPTIMIZER_DEFAULT_PARAMETERS

    # Build KEY_DETAIL_MAP from the original GUI source of truth
    key_detail_map = _get_key_detail_map()

    optimizers: dict[str, dict] = {}
    for opt_enum, defaults in OPTIMIZER_DEFAULT_PARAMETERS.items():
        clean_defaults = {}
        for k, v in defaults.items():
            if isinstance(v, float) and v == float('inf'):
                clean_defaults[k] = "Infinity"
            else:
                clean_defaults[k] = v
        optimizers[str(opt_enum)] = {
            "keys": list(defaults.keys()),
            "defaults": clean_defaults,
        }

    return {
        "optimizers": optimizers,
        "detail_map": key_detail_map,
    }


def _get_key_detail_map() -> dict:
    """Key metadata matching the original OptimizerParamsWindow.KEY_DETAIL_MAP."""
    return {
        "adam_w_mode": {"title": "Adam W Mode", "tooltip": "Whether to use weight decay correction for Adam optimizer.", "type": "bool"},
        "alpha": {"title": "Alpha", "tooltip": "Smoothing parameter for RMSprop and others.", "type": "float"},
        "amsgrad": {"title": "AMSGrad", "tooltip": "Whether to use the AMSGrad variant for Adam.", "type": "bool"},
        "beta1": {"title": "Beta1", "tooltip": "Momentum term.", "type": "float"},
        "beta2": {"title": "Beta2", "tooltip": "Coefficients for computing running averages of gradient.", "type": "float"},
        "beta3": {"title": "Beta3", "tooltip": "Coefficient for computing the Prodigy stepsize.", "type": "float"},
        "bias_correction": {"title": "Bias Correction", "tooltip": "Whether to use bias correction in optimization algorithms like Adam.", "type": "bool"},
        "block_wise": {"title": "Block Wise", "tooltip": "Whether to perform block-wise model update.", "type": "bool"},
        "capturable": {"title": "Capturable", "tooltip": "Whether some property of the optimizer can be captured.", "type": "bool"},
        "centered": {"title": "Centered", "tooltip": "Whether to center the gradient before scaling.", "type": "bool"},
        "clip_threshold": {"title": "Clip Threshold", "tooltip": "Clipping value for gradients.", "type": "float"},
        "d0": {"title": "Initial D", "tooltip": "Initial D estimate for D-adaptation.", "type": "float"},
        "d_coef": {"title": "D Coefficient", "tooltip": "Coefficient in the expression for the estimate of d.", "type": "float"},
        "dampening": {"title": "Dampening", "tooltip": "Dampening for momentum.", "type": "float"},
        "decay_rate": {"title": "Decay Rate", "tooltip": "Rate of decay for moment estimation.", "type": "float"},
        "decouple": {"title": "Decouple", "tooltip": "Use AdamW style decoupled weight decay.", "type": "bool"},
        "differentiable": {"title": "Differentiable", "tooltip": "Whether the optimization function is differentiable.", "type": "bool"},
        "eps": {"title": "EPS", "tooltip": "A small value to prevent division by zero.", "type": "float"},
        "eps2": {"title": "EPS 2", "tooltip": "A small value to prevent division by zero.", "type": "float"},
        "foreach": {"title": "ForEach", "tooltip": "Whether to use a foreach implementation if available.", "type": "bool"},
        "fsdp_in_use": {"title": "FSDP in Use", "tooltip": "Flag for using sharded parameters.", "type": "bool"},
        "fused": {"title": "Fused", "tooltip": "Whether to use a fused implementation if available.", "type": "bool"},
        "fused_back_pass": {"title": "Fused Back Pass", "tooltip": "Whether to fuse the back propagation pass with the optimizer step. Reduces VRAM but incompatible with gradient accumulation.", "type": "bool"},
        "growth_rate": {"title": "Growth Rate", "tooltip": "Limit for D estimate growth rate.", "type": "float"},
        "initial_accumulator_value": {"title": "Initial Accumulator Value", "tooltip": "Initial value for Adagrad optimizer.", "type": "float"},
        "initial_accumulator": {"title": "Initial Accumulator", "tooltip": "Starting value for moment estimates.", "type": "float"},
        "is_paged": {"title": "Is Paged", "tooltip": "Whether the optimizer's internal state should be paged to CPU.", "type": "bool"},
        "log_every": {"title": "Log Every", "tooltip": "Intervals at which logging should occur.", "type": "int"},
        "lr_decay": {"title": "LR Decay", "tooltip": "Rate at which learning rate decreases.", "type": "float"},
        "max_unorm": {"title": "Max Unorm", "tooltip": "Maximum value for gradient clipping by norms.", "type": "float"},
        "maximize": {"title": "Maximize", "tooltip": "Whether to maximize the optimization function.", "type": "bool"},
        "min_8bit_size": {"title": "Min 8bit Size", "tooltip": "Minimum tensor size for 8-bit quantization.", "type": "int"},
        "quant_block_size": {"title": "Quant Block Size", "tooltip": "Size of a block of normalized 8-bit quantization data.", "type": "int"},
        "momentum": {"title": "Momentum", "tooltip": "Factor to accelerate SGD in relevant direction.", "type": "float"},
        "nesterov": {"title": "Nesterov", "tooltip": "Whether to enable Nesterov momentum.", "type": "bool"},
        "no_prox": {"title": "No Prox", "tooltip": "Whether to use proximity updates or not.", "type": "bool"},
        "optim_bits": {"title": "Optim Bits", "tooltip": "Number of bits used for optimization.", "type": "int"},
        "percentile_clipping": {"title": "Percentile Clipping", "tooltip": "Gradient clipping based on percentile values.", "type": "int"},
        "relative_step": {"title": "Relative Step", "tooltip": "Whether to use a relative step size.", "type": "bool"},
        "safeguard_warmup": {"title": "Safeguard Warmup", "tooltip": "Avoid issues during warm-up stage.", "type": "bool"},
        "scale_parameter": {"title": "Scale Parameter", "tooltip": "Whether to scale the parameter or not.", "type": "bool"},
        "stochastic_rounding": {"title": "Stochastic Rounding", "tooltip": "Stochastic rounding for weight updates. Improves quality when using bfloat16 weights.", "type": "bool"},
        "use_bias_correction": {"title": "Bias Correction", "tooltip": "Turn on Adam's bias correction.", "type": "bool"},
        "use_triton": {"title": "Use Triton", "tooltip": "Whether Triton optimization should be used.", "type": "bool"},
        "warmup_init": {"title": "Warmup Initialization", "tooltip": "Whether to warm-up the optimizer initialization.", "type": "bool"},
        "weight_decay": {"title": "Weight Decay", "tooltip": "Regularization to prevent overfitting.", "type": "float"},
        "weight_lr_power": {"title": "Weight LR Power", "tooltip": "During warmup, the weights in the average will be equal to lr raised to this power. Set to 0 for no weighting.", "type": "float"},
        "decoupled_decay": {"title": "Decoupled Decay", "tooltip": "If set as True, then the optimizer uses decoupled weight decay as in AdamW.", "type": "bool"},
        "fixed_decay": {"title": "Fixed Decay", "tooltip": "(When Decoupled Decay is True:) Applies fixed weight decay when True; scales decay with learning rate when False.", "type": "bool"},
        "rectify": {"title": "Rectify", "tooltip": "Perform the rectified update similar to RAdam.", "type": "bool"},
        "degenerated_to_sgd": {"title": "Degenerated to SGD", "tooltip": "Performs SGD update when gradient variance is high.", "type": "bool"},
        "k": {"title": "K", "tooltip": "Number of vector projected per iteration.", "type": "int"},
        "xi": {"title": "Xi", "tooltip": "Term used in vector projections to avoid division by zero.", "type": "float"},
        "n_sma_threshold": {"title": "N SMA Threshold", "tooltip": "Number of SMA threshold.", "type": "int"},
        "ams_bound": {"title": "AMS Bound", "tooltip": "Whether to use the AMSBound variant.", "type": "bool"},
        "r": {"title": "R", "tooltip": "EMA factor.", "type": "float"},
        "adanorm": {"title": "AdaNorm", "tooltip": "Whether to use the AdaNorm variant.", "type": "bool"},
        "adam_debias": {"title": "Adam Debias", "tooltip": "Only correct the denominator to avoid inflating step sizes early in training.", "type": "bool"},
        "slice_p": {"title": "Slice Parameters", "tooltip": "Reduce memory usage by calculating LR adaptation statistics on only every pth entry. Values ~11 are reasonable.", "type": "int"},
        "cautious": {"title": "Cautious", "tooltip": "Whether to use the Cautious variant.", "type": "bool"},
        "weight_decay_by_lr": {"title": "Weight Decay by LR", "tooltip": "Automatically adjust weight decay based on lr.", "type": "bool"},
        "prodigy_steps": {"title": "Prodigy Steps", "tooltip": "Turn off Prodigy after N steps.", "type": "int"},
        "use_speed": {"title": "Use Speed", "tooltip": "Use speed method.", "type": "bool"},
        "split_groups": {"title": "Split Groups", "tooltip": "Use split groups when training multiple params (UNet, TE).", "type": "bool"},
        "split_groups_mean": {"title": "Split Groups Mean", "tooltip": "Use mean for split groups.", "type": "bool"},
        "factored": {"title": "Factored", "tooltip": "Use factored.", "type": "bool"},
        "factored_fp32": {"title": "Factored FP32", "tooltip": "Use factored_fp32.", "type": "bool"},
        "use_stableadamw": {"title": "StableAdamW", "tooltip": "Use StableAdamW for gradient scaling.", "type": "bool"},
        "use_cautious": {"title": "Use Cautious", "tooltip": "Use cautious method.", "type": "bool"},
        "use_grams": {"title": "Use GRAMS", "tooltip": "Use grams method.", "type": "bool"},
        "use_adopt": {"title": "Use ADOPT", "tooltip": "Use adopt method.", "type": "bool"},
        "d_limiter": {"title": "D Limiter", "tooltip": "Prevent over-estimated LRs when gradients and EMA are still stabilizing.", "type": "bool"},
        "use_schedulefree": {"title": "Schedule-Free", "tooltip": "Use Schedule-Free method.", "type": "bool"},
        "use_orthograd": {"title": "OrthoGrad", "tooltip": "Use orthograd method.", "type": "bool"},
        "nnmf_factor": {"title": "Factored Optimizer", "tooltip": "Enables memory-efficient mode by applying fast low-rank factorization to optimizer states.", "type": "bool"},
        "orthogonal_gradient": {"title": "OrthoGrad", "tooltip": "Reduces overfitting by removing the gradient component parallel to the weight.", "type": "bool"},
        "use_atan2": {"title": "Atan2 Scaling", "tooltip": "A robust replacement for eps which also incorporates gradient clipping.", "type": "bool"},
        "cautious_mask": {"title": "Cautious Variant", "tooltip": "Applies a mask to dampen or zero-out momentum components that disagree with the current gradient direction.", "type": "bool"},
        "grams_moment": {"title": "GRAMS Variant", "tooltip": "Aligns the momentum direction with the current gradient direction while preserving its accumulated magnitude.", "type": "bool"},
        "use_AdEMAMix": {"title": "AdEMAMix EMA", "tooltip": "Adds a second, slow-moving EMA to stabilize updates and accelerate training.", "type": "bool"},
        "beta3_ema": {"title": "Beta3 EMA", "tooltip": "Coefficient for slow-moving EMA of AdEMAMix.", "type": "float"},
        "beta1_warmup": {"title": "Beta1 Warmup Steps", "tooltip": "Number of warmup steps to gradually increase beta1.", "type": "int"},
        "min_beta1": {"title": "Minimum Beta1", "tooltip": "Starting beta1 value for warmup scheduling.", "type": "float"},
        "Simplified_AdEMAMix": {"title": "Simplified AdEMAMix", "tooltip": "Enables a simplified, single-EMA variant of AdEMAMix.", "type": "bool"},
        "alpha_grad": {"title": "Grad Alpha", "tooltip": "Controls the mixing coefficient between raw gradients and momentum gradients.", "type": "float"},
        "kourkoutas_beta": {"title": "Kourkoutas Beta", "tooltip": "Enables layer-wise dynamic beta2 adaptation.", "type": "bool"},
        "k_warmup_steps": {"title": "K-Beta Warmup Steps", "tooltip": "Number of initial steps during which dynamic beta2 logic is held off.", "type": "int"},
        "schedulefree_c": {"title": "Schedule-Free Averaging Strength", "tooltip": "Larger values = more responsive; smaller values = smoother.", "type": "float"},
        "ns_steps": {"title": "Newton-Schulz Iterations", "tooltip": "Controls number of iterations for update orthogonalization.", "type": "int"},
        "MuonWithAuxAdam": {"title": "Muon With Aux Adam", "tooltip": "Non-hidden layers fallback to ADAMW, and MUON takes the rest.", "type": "bool"},
        "muon_hidden_layers": {"title": "Hidden Layers", "tooltip": "Comma-separated list of hidden layers to train using Muon.", "type": "str"},
        "muon_adam_regex": {"title": "Use Regex", "tooltip": "Whether to use regular expressions for hidden layers.", "type": "bool"},
        "muon_adam_lr": {"title": "Auxiliary Adam LR", "tooltip": "Learning rate for the auxiliary AdamW optimizer.", "type": "float"},
        "muon_te1_adam_lr": {"title": "AuxAdam TE1 LR", "tooltip": "Learning rate for the auxiliary AdamW for the first text encoder.", "type": "float"},
        "muon_te2_adam_lr": {"title": "AuxAdam TE2 LR", "tooltip": "Learning rate for the auxiliary AdamW for the second text encoder.", "type": "float"},
        "rms_rescaling": {"title": "RMS Rescaling", "tooltip": "More accurate method to match the Adam LR, but slower.", "type": "bool"},
        "normuon_variant": {"title": "NorMuon Variant", "tooltip": "Combines Muon orthogonalization with per-neuron adaptive learning rates.", "type": "bool"},
        "beta2_normuon": {"title": "NorMuon Beta2", "tooltip": "Decay rate for the neuron-wise second-moment estimator in NorMuon.", "type": "float"},
        "normuon_eps": {"title": "NorMuon EPS", "tooltip": "Epsilon for NorMuon normalization stability.", "type": "float"},
        "low_rank_ortho": {"title": "Low-rank Orthogonalization", "tooltip": "Use low-rank orthogonalization to accelerate Muon.", "type": "bool"},
        "ortho_rank": {"title": "Ortho Rank", "tooltip": "Target rank for low-rank orthogonalization.", "type": "int"},
        "accelerated_ns": {"title": "Accelerated Newton-Schulz", "tooltip": "Enhanced Newton-Schulz variant with optimal coefficients.", "type": "bool"},
        "cautious_wd": {"title": "Cautious Weight Decay", "tooltip": "Applies weight decay only where signs align with optimizer update direction.", "type": "bool"},
        "approx_mars": {"title": "Approx MARS-M", "tooltip": "Variance reduction technique using the previous step's gradient.", "type": "bool"},
        "kappa_p": {"title": "Lion-K P-value", "tooltip": "Controls the Lp-norm geometry for the Lion update. 1.0 = Standard Lion, 2.0 = Spherical Lion.", "type": "float"},
        "auto_kappa_p": {"title": "Auto Lion-K", "tooltip": "Automatically determines the optimal P-value based on layer dimensions.", "type": "bool"},
        "compile": {"title": "Compiled Optimizer", "tooltip": "Enables PyTorch compilation for the optimizer internal step logic.", "type": "bool"},
        "muon_adam_config": {"title": "Muon Adam Config", "tooltip": "Configuration for the auxiliary Adam optimizer in Muon.", "type": "dict"},
    }


@router.post("/export")
def export_config() -> dict:
    """
    Export the full config including inlined concepts and samples
    (via to_pack_dict).
    """
    service = ConfigService.get_instance()
    try:
        return service.export_config()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Referenced file not found: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
