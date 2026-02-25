import type { ModelType } from "@/types/generated/enums";
import type { FieldDef, SectionDef } from "./fieldTypes";

export interface TrainingColumnDef {
  sections: SectionDef[];
}

export interface TrainingSchema {
  columns: [TrainingColumnDef, TrainingColumnDef, TrainingColumnDef];
}

// Common sections reused across model types

function baseFrame(): SectionDef {
  return {
    id: "base",
    label: "Base",
    fields: [
      { key: "optimizer.optimizer", label: "Optimizer", type: "select-adv", stringOptions: [], tooltip: "The type of optimizer" },
      { key: "learning_rate_scheduler", label: "LR Scheduler", type: "select-adv", stringOptions: [], tooltip: "Learning rate scheduler" },
      { key: "learning_rate", label: "Learning Rate", type: "entry", inputType: "number", tooltip: "Base learning rate" },
      { key: "learning_rate_warmup_steps", label: "LR Warmup Steps", type: "entry", inputType: "number", tooltip: "Steps to warm up learning rate" },
      { key: "learning_rate_min_factor", label: "LR Min Factor", type: "entry", inputType: "number" },
      { key: "learning_rate_cycles", label: "LR Cycles", type: "entry", inputType: "number" },
      { key: "epochs", label: "Epochs", type: "entry", inputType: "number", tooltip: "Number of training epochs" },
      { key: "batch_size", label: "Local Batch Size", type: "entry", inputType: "number", tooltip: "Batch size per GPU" },
      { key: "gradient_accumulation_steps", label: "Accumulation Steps", type: "entry", inputType: "number" },
      { key: "learning_rate_scaler", label: "LR Scaler", type: "select", stringOptions: [] },
      { key: "clip_grad_norm", label: "Clip Grad Norm", type: "entry", inputType: "number", nullable: true },
    ],
  };
}

function textEncoderFrame(): SectionDef {
  return {
    id: "text_encoder",
    label: "Text Encoder",
    fields: [
      { key: "text_encoder.train", label: "Train Text Encoder", type: "toggle" },
      { key: "text_encoder.dropout_probability", label: "Caption Dropout", type: "entry", inputType: "number" },
      { key: "text_encoder.stop_training_after", label: "Stop Training After", type: "time-entry", valuePath: "text_encoder.stop_training_after", unitPath: "text_encoder.stop_training_after_unit" },
      { key: "text_encoder.learning_rate", label: "Text Encoder LR", type: "entry", inputType: "number", nullable: true },
      { key: "text_encoder_layer_skip", label: "Clip Skip", type: "entry", inputType: "number" },
    ],
  };
}

function textEncoderNFrame(i: number, opts: { supportsInclude?: boolean; supportsLayerSkip?: boolean; supportsSequenceLength?: boolean } = {}): SectionDef {
  const suffix = i > 1 ? `_${i}` : "";
  const fields: FieldDef[] = [];
  if (opts.supportsInclude) fields.push({ key: `text_encoder${suffix}.include`, label: `Include Text Encoder ${i}`, type: "toggle" });
  fields.push(
    { key: `text_encoder${suffix}.train`, label: `Train Text Encoder ${i}`, type: "toggle" },
    { key: `text_encoder${suffix}.train_embedding`, label: `Train TE ${i} Embedding`, type: "toggle" },
    { key: `text_encoder${suffix}.dropout_probability`, label: "Dropout Probability", type: "entry", inputType: "number" },
    { key: `text_encoder${suffix}.stop_training_after`, label: "Stop Training After", type: "time-entry", valuePath: `text_encoder${suffix}.stop_training_after`, unitPath: `text_encoder${suffix}.stop_training_after_unit` },
    { key: `text_encoder${suffix}.learning_rate`, label: `TE ${i} Learning Rate`, type: "entry", inputType: "number", nullable: true },
  );
  if (opts.supportsLayerSkip !== false) fields.push({ key: `text_encoder${suffix}_layer_skip`, label: `TE ${i} Clip Skip`, type: "entry", inputType: "number" });
  if (opts.supportsSequenceLength) fields.push({ key: `text_encoder${suffix}_sequence_length`, label: `TE ${i} Sequence Length`, type: "entry", inputType: "number", nullable: true });
  return { id: `text_encoder_${i}`, label: `Text Encoder ${i}`, fields };
}

function embeddingFrame(): SectionDef {
  return {
    id: "embedding",
    label: "Embedding",
    fields: [
      { key: "embedding_learning_rate", label: "Embeddings LR", type: "entry", inputType: "number", nullable: true },
      { key: "preserve_embedding_norm", label: "Preserve Embedding Norm", type: "toggle" },
    ],
  };
}

function base2Frame(videoEnabled: boolean = false): SectionDef {
  const fields: FieldDef[] = [
    { key: "ema", label: "EMA", type: "select", stringOptions: [] },
    { key: "ema_decay", label: "EMA Decay", type: "entry", inputType: "number" },
    { key: "ema_update_step_interval", label: "EMA Update Interval", type: "entry", inputType: "number" },
    { key: "gradient_checkpointing", label: "Gradient Checkpointing", type: "select-adv", stringOptions: [] },
    { key: "layer_offload_fraction", label: "Layer Offload Fraction", type: "entry", inputType: "number" },
    { key: "train_dtype", label: "Train Data Type", type: "select-kv", options: [
      { label: "float32", value: "FLOAT_32" }, { label: "float16", value: "FLOAT_16" },
      { label: "bfloat16", value: "BFLOAT_16" }, { label: "tfloat32", value: "TFLOAT_32" },
    ] },
    { key: "fallback_train_dtype", label: "Fallback Train Dtype", type: "select-kv", options: [
      { label: "float32", value: "FLOAT_32" }, { label: "bfloat16", value: "BFLOAT_16" },
    ] },
    { key: "enable_autocast_cache", label: "Autocast Cache", type: "toggle" },
    { key: "resolution", label: "Resolution", type: "entry" },
  ];
  if (videoEnabled) fields.push({ key: "frames", label: "Frames", type: "entry" });
  fields.push({ key: "force_circular_padding", label: "Force Circular Padding", type: "toggle" });
  return { id: "base2", label: "Training Settings", fields };
}

function unetFrame(): SectionDef {
  return {
    id: "unet",
    label: "UNet",
    fields: [
      { key: "unet.train", label: "Train UNet", type: "toggle" },
      { key: "unet.stop_training_after", label: "Stop Training After", type: "time-entry", valuePath: "unet.stop_training_after", unitPath: "unet.stop_training_after_unit" },
      { key: "unet.learning_rate", label: "UNet Learning Rate", type: "entry", inputType: "number", nullable: true },
      { key: "rescale_noise_scheduler_to_zero_terminal_snr", label: "Rescale Noise + V-pred", type: "toggle" },
    ],
  };
}

function priorFrame(): SectionDef {
  return {
    id: "prior",
    label: "Prior",
    fields: [
      { key: "prior.train", label: "Train Prior", type: "toggle" },
      { key: "prior.stop_training_after", label: "Stop Training After", type: "time-entry", valuePath: "prior.stop_training_after", unitPath: "prior.stop_training_after_unit" },
      { key: "prior.learning_rate", label: "Prior Learning Rate", type: "entry", inputType: "number", nullable: true },
    ],
  };
}

function transformerFrame(opts: { supportsGuidanceScale?: boolean; supportsAttentionMask?: boolean } = {}): SectionDef {
  const fields: FieldDef[] = [
    { key: "transformer.train", label: "Train Transformer", type: "toggle" },
    { key: "transformer.stop_training_after", label: "Stop Training After", type: "time-entry", valuePath: "transformer.stop_training_after", unitPath: "transformer.stop_training_after_unit" },
    { key: "transformer.learning_rate", label: "Transformer LR", type: "entry", inputType: "number", nullable: true },
  ];
  if (opts.supportsAttentionMask !== false) fields.push({ key: "transformer.attention_mask", label: "Force Attention Mask", type: "toggle" });
  if (opts.supportsGuidanceScale) fields.push({ key: "transformer.guidance_scale", label: "Guidance Scale", type: "entry", inputType: "number" });
  return { id: "transformer", label: "Transformer", fields };
}

function noiseFrame(opts: { supportsGenOffset?: boolean; supportsDynShift?: boolean } = {}): SectionDef {
  const fields: FieldDef[] = [
    { key: "offset_noise_weight", label: "Offset Noise Weight", type: "entry", inputType: "number" },
  ];
  if (opts.supportsGenOffset) fields.push({ key: "generalized_offset_noise", label: "Generalized Offset Noise", type: "toggle" });
  fields.push(
    { key: "perturbation_noise_weight", label: "Perturbation Noise", type: "entry", inputType: "number" },
    { key: "timestep_distribution", label: "Timestep Distribution", type: "select-adv", stringOptions: [] },
    { key: "min_noising_strength", label: "Min Noising Strength", type: "entry", inputType: "number" },
    { key: "max_noising_strength", label: "Max Noising Strength", type: "entry", inputType: "number" },
    { key: "noising_weight", label: "Noising Weight", type: "entry", inputType: "number" },
    { key: "noising_bias", label: "Noising Bias", type: "entry", inputType: "number" },
    { key: "timestep_shift", label: "Timestep Shift", type: "entry", inputType: "number" },
  );
  if (opts.supportsDynShift) fields.push({ key: "dynamic_timestep_shifting", label: "Dynamic Timestep Shifting", type: "toggle" });
  return { id: "noise", label: "Noise", fields };
}

function maskedFrame(): SectionDef {
  return {
    id: "masked",
    label: "Masked Training",
    fields: [
      { key: "masked_training", label: "Masked Training", type: "toggle" },
      { key: "unmasked_probability", label: "Unmasked Probability", type: "entry", inputType: "number" },
      { key: "unmasked_weight", label: "Unmasked Weight", type: "entry", inputType: "number" },
      { key: "normalize_masked_area_loss", label: "Normalize Masked Area Loss", type: "toggle" },
      { key: "masked_prior_preservation_weight", label: "Masked Prior Preservation", type: "entry", inputType: "number" },
      { key: "custom_conditioning_image", label: "Custom Conditioning Image", type: "toggle" },
    ],
  };
}

function lossFrame(supportsVb: boolean = false): SectionDef {
  const fields: FieldDef[] = [
    { key: "mse_strength", label: "MSE Strength", type: "entry", inputType: "number" },
    { key: "mae_strength", label: "MAE Strength", type: "entry", inputType: "number" },
    { key: "log_cosh_strength", label: "log-cosh Strength", type: "entry", inputType: "number" },
    { key: "huber_strength", label: "Huber Strength", type: "entry", inputType: "number" },
    { key: "huber_delta", label: "Huber Delta", type: "entry", inputType: "number" },
  ];
  if (supportsVb) fields.push({ key: "vb_loss_strength", label: "VB Strength", type: "entry", inputType: "number" });
  fields.push(
    { key: "loss_weight_fn", label: "Loss Weight Function", type: "select", stringOptions: [] },
    { key: "loss_weight_strength", label: "Loss Weight Strength", type: "entry", inputType: "number" },
    { key: "loss_scaler", label: "Loss Scaler", type: "select", stringOptions: [] },
  );
  return { id: "loss", label: "Loss", fields };
}

function layerFrame(): SectionDef {
  return {
    id: "layer",
    label: "Layer Filter",
    fields: [
      { key: "layer_filter", label: "Layer Filter", type: "layer-filter" },
    ],
  };
}

// Per-model schemas
const SD_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), textEncoderFrame(), embeddingFrame()] },
    { sections: [base2Frame(), unetFrame(), noiseFrame({ supportsGenOffset: true })] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const SDXL_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), textEncoderNFrame(1), textEncoderNFrame(2), embeddingFrame()] },
    { sections: [base2Frame(), unetFrame(), noiseFrame({ supportsGenOffset: true })] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const SD3_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), textEncoderNFrame(1, { supportsInclude: true }), textEncoderNFrame(2, { supportsInclude: true }), textEncoderNFrame(3, { supportsInclude: true }), embeddingFrame()] },
    { sections: [base2Frame(), transformerFrame(), noiseFrame()] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const FLUX_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), textEncoderNFrame(1, { supportsInclude: true }), textEncoderNFrame(2, { supportsInclude: true, supportsSequenceLength: true }), embeddingFrame()] },
    { sections: [base2Frame(), transformerFrame({ supportsGuidanceScale: true }), noiseFrame({ supportsDynShift: true })] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const FLUX2_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), { id: "te_flux2", label: "Text Encoder", fields: [
      { key: "text_encoder.dropout_probability", label: "Caption Dropout", type: "entry", inputType: "number" },
      { key: "text_encoder_sequence_length", label: "Sequence Length", type: "entry", inputType: "number", nullable: true },
    ] }] },
    { sections: [base2Frame(), transformerFrame({ supportsGuidanceScale: true, supportsAttentionMask: false }), noiseFrame({ supportsDynShift: true })] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const WUERSTCHEN_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), textEncoderFrame(), embeddingFrame()] },
    { sections: [base2Frame(), priorFrame(), noiseFrame()] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const PIXART_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), textEncoderFrame(), embeddingFrame()] },
    { sections: [base2Frame(), transformerFrame(), noiseFrame()] },
    { sections: [maskedFrame(), lossFrame(true), layerFrame()] },
  ],
};

const HUNYUAN_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), textEncoderNFrame(1, { supportsInclude: true }), textEncoderNFrame(2, { supportsInclude: true }), embeddingFrame()] },
    { sections: [base2Frame(true), transformerFrame({ supportsGuidanceScale: true }), noiseFrame()] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const HI_DREAM_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), textEncoderNFrame(1, { supportsInclude: true }), textEncoderNFrame(2, { supportsInclude: true }), textEncoderNFrame(3, { supportsInclude: true }), textEncoderNFrame(4, { supportsInclude: true, supportsLayerSkip: false }), embeddingFrame()] },
    { sections: [base2Frame(true), transformerFrame(), noiseFrame()] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const CHROMA_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), textEncoderFrame(), embeddingFrame()] },
    { sections: [base2Frame(), transformerFrame({ supportsGuidanceScale: false, supportsAttentionMask: false }), noiseFrame()] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const ZIMAGE_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), { id: "te_zimg", label: "Text Encoder", fields: [
      { key: "text_encoder.dropout_probability", label: "Caption Dropout", type: "entry", inputType: "number" },
    ] }] },
    { sections: [base2Frame(), transformerFrame({ supportsGuidanceScale: false, supportsAttentionMask: false }), noiseFrame({ supportsDynShift: true })] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const SANA_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), textEncoderFrame(), embeddingFrame()] },
    { sections: [base2Frame(), transformerFrame(), noiseFrame()] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

const QWEN_TRAINING: TrainingSchema = {
  columns: [
    { sections: [baseFrame(), { id: "te_qwen", label: "Text Encoder", fields: [
      { key: "text_encoder.dropout_probability", label: "Caption Dropout", type: "entry", inputType: "number" },
      { key: "text_encoder_sequence_length", label: "Sequence Length", type: "entry", inputType: "number", nullable: true },
    ] }] },
    { sections: [base2Frame(), transformerFrame({ supportsGuidanceScale: false, supportsAttentionMask: false }), noiseFrame({ supportsDynShift: true })] },
    { sections: [maskedFrame(), lossFrame(), layerFrame()] },
  ],
};

export function getTrainingSchema(modelType: ModelType): TrainingSchema {
  if (modelType.startsWith("STABLE_DIFFUSION_15") || modelType.startsWith("STABLE_DIFFUSION_20") || modelType.startsWith("STABLE_DIFFUSION_21")) return SD_TRAINING;
  if (modelType.startsWith("STABLE_DIFFUSION_XL")) return SDXL_TRAINING;
  if (modelType === "STABLE_DIFFUSION_3" || modelType === "STABLE_DIFFUSION_35") return SD3_TRAINING;
  if (modelType === "FLUX_DEV_1" || modelType === "FLUX_FILL_DEV_1") return FLUX_TRAINING;
  if (modelType === "FLUX_2") return FLUX2_TRAINING;
  if (modelType === "WUERSTCHEN_2" || modelType === "STABLE_CASCADE_1") return WUERSTCHEN_TRAINING;
  if (modelType === "PIXART_ALPHA" || modelType === "PIXART_SIGMA") return PIXART_TRAINING;
  if (modelType === "SANA") return SANA_TRAINING;
  if (modelType === "HUNYUAN_VIDEO") return HUNYUAN_TRAINING;
  if (modelType === "HI_DREAM_FULL") return HI_DREAM_TRAINING;
  if (modelType === "CHROMA_1") return CHROMA_TRAINING;
  if (modelType === "Z_IMAGE") return ZIMAGE_TRAINING;
  if (modelType === "QWEN") return QWEN_TRAINING;
  return SD_TRAINING;
}
