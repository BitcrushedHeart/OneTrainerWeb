/**
 * Human-friendly display labels for all enum values used in OneTrainerWeb.
 *
 * Usage:
 *   import { enumLabel } from "@/utils/enumLabels";
 *   enumLabel("STABLE_DIFFUSION_15")  // => "Stable Diffusion 1.5"
 *   enumLabel("FINE_TUNE")            // => "Fine-Tune"
 *   enumLabel("UNKNOWN_VALUE")        // => "Unknown Value" (smart fallback)
 */

const labels: Record<string, string> = {
  // ── ModelType ──────────────────────────────────────────────────────────
  STABLE_DIFFUSION_15: "Stable Diffusion 1.5",
  STABLE_DIFFUSION_15_INPAINTING: "Stable Diffusion 1.5 Inpainting",
  STABLE_DIFFUSION_20: "Stable Diffusion 2.0",
  STABLE_DIFFUSION_20_BASE: "Stable Diffusion 2.0 Base",
  STABLE_DIFFUSION_20_INPAINTING: "Stable Diffusion 2.0 Inpainting",
  STABLE_DIFFUSION_20_DEPTH: "Stable Diffusion 2.0 Depth",
  STABLE_DIFFUSION_21: "Stable Diffusion 2.1",
  STABLE_DIFFUSION_21_BASE: "Stable Diffusion 2.1 Base",
  STABLE_DIFFUSION_3: "Stable Diffusion 3.0",
  STABLE_DIFFUSION_35: "Stable Diffusion 3.5",
  STABLE_DIFFUSION_XL_10_BASE: "SDXL 1.0 Base",
  STABLE_DIFFUSION_XL_10_BASE_INPAINTING: "SDXL 1.0 Inpainting",
  WUERSTCHEN_2: "Wuerstchen 2",
  STABLE_CASCADE_1: "Stable Cascade 1",
  PIXART_ALPHA: "PixArt Alpha",
  PIXART_SIGMA: "PixArt Sigma",
  FLUX_DEV_1: "Flux Dev 1",
  FLUX_FILL_DEV_1: "Flux Fill Dev 1",
  FLUX_2: "Flux 2",
  SANA: "Sana",
  HUNYUAN_VIDEO: "Hunyuan Video",
  HI_DREAM_FULL: "HiDream Full",
  CHROMA_1: "Chroma 1",
  QWEN: "Qwen",
  Z_IMAGE: "Z-Image",

  // ── TrainingMethod ─────────────────────────────────────────────────────
  FINE_TUNE: "Fine-Tune",
  LORA: "LoRA",
  EMBEDDING: "Embedding",
  FINE_TUNE_VAE: "Fine-Tune VAE",

  // ── DataType ───────────────────────────────────────────────────────────
  FLOAT_8: "Float 8",
  FLOAT_16: "Float 16",
  FLOAT_32: "Float 32",
  BFLOAT_16: "BFloat 16",
  TFLOAT_32: "TFloat 32",
  INT_8: "Int 8",
  NFLOAT_4: "NFloat 4",
  FLOAT_W8A8: "Float W8A8",
  INT_W8A8: "Int W8A8",
  GGUF: "GGUF",
  GGUF_A8_FLOAT: "GGUF A8 Float",
  GGUF_A8_INT: "GGUF A8 Int",

  // ── PeftType ───────────────────────────────────────────────────────────
  LOHA: "LoHa",
  OFT_2: "OFT 2",

  // ── EMAMode ────────────────────────────────────────────────────────────
  OFF: "Off",
  GPU: "GPU",
  CPU: "CPU",

  // ── GradientCheckpointingMethod ────────────────────────────────────────
  ON: "On",
  CPU_OFFLOADED: "CPU Offloaded",

  // ── GradientReducePrecision ────────────────────────────────────────────
  WEIGHT_DTYPE: "Weight Dtype",
  WEIGHT_DTYPE_STOCHASTIC: "Weight Dtype Stochastic",
  FLOAT_32_STOCHASTIC: "Float 32 Stochastic",

  // ── BalancingStrategy ──────────────────────────────────────────────────
  REPEATS: "Repeats",
  SAMPLES: "Samples",

  // ── ConceptType ────────────────────────────────────────────────────────
  STANDARD: "Standard",
  VALIDATION: "Validation",
  PRIOR_PREDICTION: "Prior Prediction",

  // ── ConfigPart ─────────────────────────────────────────────────────────
  SETTINGS: "Settings",
  ALL: "All",

  // ── CloudAction ────────────────────────────────────────────────────────
  STOP: "Stop",
  DELETE: "Delete",

  // ── CloudFileSync ──────────────────────────────────────────────────────
  FABRIC_SFTP: "Fabric SFTP",
  NATIVE_SCP: "Native SCP",

  // ── CloudType ──────────────────────────────────────────────────────────
  RUNPOD: "RunPod",
  LINUX: "Linux",

  // ── FileType ───────────────────────────────────────────────────────────
  IMAGE: "Image",
  VIDEO: "Video",
  AUDIO: "Audio",

  // ── GenerateCaptionsModel ──────────────────────────────────────────────
  BLIP: "BLIP",
  BLIP2: "BLIP2",
  WD14_VIT_2: "WD14 ViT 2",

  // ── GenerateMasksModel ─────────────────────────────────────────────────
  CLIPSEG: "CLIPSeg",
  REMBG: "RemBG",
  REMBG_HUMAN: "RemBG Human",
  COLOR: "Color",

  // ── ImageFormat ────────────────────────────────────────────────────────
  PNG: "PNG",
  JPG: "JPG",

  // ── AudioFormat ────────────────────────────────────────────────────────
  MP3: "MP3",
  MP4: "MP4",

  // ── VideoFormat ────────────────────────────────────────────────────────
  PNG_IMAGE_SEQUENCE: "PNG Image Sequence",
  JPG_IMAGE_SEQUENCE: "JPG Image Sequence",

  // ── LearningRateScaler / LossScaler ────────────────────────────────────
  BATCH: "Batch",
  GLOBAL_BATCH: "Global Batch",
  GRADIENT_ACCUMULATION: "Gradient Accumulation",
  BOTH: "Both",
  GLOBAL_BOTH: "Global Both",

  // ── LearningRateScheduler ──────────────────────────────────────────────
  CONSTANT: "Constant",
  LINEAR: "Linear",
  COSINE: "Cosine",
  COSINE_WITH_RESTARTS: "Cosine with Restarts",
  COSINE_WITH_HARD_RESTARTS: "Cosine with Hard Restarts",
  REX: "Rex",
  ADAFACTOR: "Adafactor",
  CUSTOM: "Custom",

  // ── LossWeight ─────────────────────────────────────────────────────────
  P2: "P2",
  MIN_SNR_GAMMA: "Min SNR Gamma",
  DEBIASED_ESTIMATION: "Debiased Estimation",
  SIGMA: "Sigma",

  // ── ModelFormat ────────────────────────────────────────────────────────
  DIFFUSERS: "Diffusers",
  CKPT: "Checkpoint",
  SAFETENSORS: "Safetensors",
  LEGACY_SAFETENSORS: "Legacy Safetensors",
  COMFY_LORA: "Comfy LoRA",
  INTERNAL: "Internal",

  // ── NoiseScheduler ─────────────────────────────────────────────────────
  DDIM: "DDIM",
  EULER: "Euler",
  EULER_A: "Euler A",
  DPMPP: "DPM++",
  DPMPP_SDE: "DPM++ SDE",
  UNIPC: "UniPC",
  EULER_KARRAS: "Euler Karras",
  DPMPP_KARRAS: "DPM++ Karras",
  DPMPP_SDE_KARRAS: "DPM++ SDE Karras",
  UNIPC_KARRAS: "UniPC Karras",

  // ── Optimizer ──────────────────────────────────────────────────────────
  // Most optimizer names are already proper acronyms/names; keep as-is or
  // apply light formatting for readability.
  ADAGRAD: "Adagrad",
  ADAGRAD_8BIT: "Adagrad 8-bit",
  ADAM: "Adam",
  ADAM_8BIT: "Adam 8-bit",
  ADAMW: "AdamW",
  ADAMW_8BIT: "AdamW 8-bit",
  ADAMW_ADV: "AdamW Adv",
  AdEMAMix: "AdEMAMix",
  "AdEMAMix_8BIT": "AdEMAMix 8-bit",
  SIMPLIFIED_AdEMAMix: "Simplified AdEMAMix",
  ADOPT: "ADOPT",
  ADOPT_ADV: "ADOPT Adv",
  LAMB: "LAMB",
  LAMB_8BIT: "LAMB 8-bit",
  LARS: "LARS",
  LARS_8BIT: "LARS 8-bit",
  LION: "LION",
  LION_8BIT: "LION 8-bit",
  LION_ADV: "LION Adv",
  RMSPROP: "RMSProp",
  RMSPROP_8BIT: "RMSProp 8-bit",
  SGD: "SGD",
  SGD_8BIT: "SGD 8-bit",
  SIGNSGD_ADV: "SignSGD Adv",
  SCHEDULE_FREE_ADAMW: "Schedule-Free AdamW",
  SCHEDULE_FREE_SGD: "Schedule-Free SGD",
  DADAPT_ADA_GRAD: "D-Adapt AdaGrad",
  DADAPT_ADAM: "D-Adapt Adam",
  DADAPT_ADAN: "D-Adapt Adan",
  DADAPT_LION: "D-Adapt LION",
  DADAPT_SGD: "D-Adapt SGD",
  PRODIGY: "Prodigy",
  PRODIGY_PLUS_SCHEDULE_FREE: "Prodigy+ Schedule-Free",
  PRODIGY_ADV: "Prodigy Adv",
  LION_PRODIGY_ADV: "LION Prodigy Adv",
  CAME: "CAME",
  CAME_8BIT: "CAME 8-bit",
  MUON: "Muon",
  MUON_ADV: "Muon Adv",
  ADAMUON_ADV: "AdaMuon Adv",
  ADABELIEF: "AdaBelief",
  TIGER: "TIGER",
  AIDA: "AIDA",
  YOGI: "Yogi",

  // ── TimeUnit ───────────────────────────────────────────────────────────
  EPOCH: "Epoch",
  STEP: "Step",
  SECOND: "Second",
  MINUTE: "Minute",
  HOUR: "Hour",
  NEVER: "Never",
  ALWAYS: "Always",

  // ── TimestepDistribution ───────────────────────────────────────────────
  UNIFORM: "Uniform",
  SIGMOID: "Sigmoid",
  LOGIT_NORMAL: "Logit Normal",
  HEAVY_TAIL: "Heavy Tail",
  COS_MAP: "Cos Map",
  INVERTED_PARABOLA: "Inverted Parabola",

  // ── Common / shared values ─────────────────────────────────────────────
  NONE: "None",
};

/**
 * Smart fallback formatter for enum values not in the explicit map.
 * - Replaces underscores with spaces
 * - Title-cases each word (but leaves standalone numbers as-is)
 */
function formatFallback(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b([A-Za-z])([A-Za-z]*)\b/g, (_match, first: string, rest: string) =>
      first.toUpperCase() + rest.toLowerCase(),
    );
}

/**
 * Returns a human-friendly display label for any enum value string.
 *
 * Looks up the value in an explicit map of curated labels. If not found,
 * applies a smart fallback formatter that replaces underscores with spaces
 * and applies title-casing.
 */
export function enumLabel(value: string): string {
  return labels[value] ?? formatFallback(value);
}
