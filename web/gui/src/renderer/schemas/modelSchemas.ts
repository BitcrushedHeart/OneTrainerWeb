import type { ModelType } from "@/types/generated/enums";
import type { FieldDef, SectionDef } from "./fieldTypes";

export interface ModelSchema {
  sections: SectionDef[];
}

const DTYPE_OPTIONS = [
  { label: "float32", value: "FLOAT_32" },
  { label: "bfloat16", value: "BFLOAT_16" },
  { label: "float16", value: "FLOAT_16" },
  { label: "float8 (W8)", value: "FLOAT_8" },
  { label: "nfloat4", value: "NFLOAT_4" },
];

const DTYPE_WITH_A8 = [
  ...DTYPE_OPTIONS,
  { label: "float W8A8", value: "FLOAT_W8A8" },
  { label: "int W8A8", value: "INT_W8A8" },
];

const DTYPE_WITH_GGUF_A8 = [
  ...DTYPE_OPTIONS,
  { label: "float W8A8", value: "FLOAT_W8A8" },
  { label: "int W8A8", value: "INT_W8A8" },
  { label: "GGUF", value: "GGUF" },
  { label: "GGUF A8 float", value: "GGUF_A8_FLOAT" },
  { label: "GGUF A8 int", value: "GGUF_A8_INT" },
];

const OUTPUT_DTYPE_OPTIONS = [
  { label: "float16", value: "FLOAT_16" },
  { label: "float32", value: "FLOAT_32" },
  { label: "bfloat16", value: "BFLOAT_16" },
  { label: "float8", value: "FLOAT_8" },
  { label: "nfloat4", value: "NFLOAT_4" },
];

// Base section present on all models
function baseSection(): SectionDef {
  return {
    id: "base",
    label: "Base Model",
    fields: [
      { key: "secrets.huggingface_token", label: "Hugging Face Token", type: "entry", tooltip: "Your HuggingFace access token" },
      { key: "base_model_name", label: "Base Model", type: "file", tooltip: "Filename, directory or HuggingFace repository of the base model" },
      { key: "compile", label: "Compile Transformer Blocks", type: "toggle", tooltip: "Uses torch.compile to speed up training" },
    ],
  };
}

function quantizationSection(): SectionDef {
  return {
    id: "quantization",
    label: "Quantization",
    fields: [
      { key: "quantization.layer_filter_preset", label: "Quantization Preset", type: "select", stringOptions: ["full", "custom"] },
      { key: "quantization.layer_filter", label: "Quantization Filter", type: "entry", tooltip: "Comma-separated layers to quantize" },
      { key: "quantization.layer_filter_regex", label: "Regex", type: "toggle" },
      { key: "quantization.svd_dtype", label: "SVDQuant", type: "select-kv", options: [{ label: "disabled", value: "NONE" }, { label: "float32", value: "FLOAT_32" }, { label: "bfloat16", value: "BFLOAT_16" }] },
      { key: "quantization.svd_rank", label: "SVDQuant Rank", type: "entry", inputType: "number" },
    ],
  };
}

// Model-specific sections builder
function unetSection(): SectionDef {
  return {
    id: "unet",
    label: "UNet",
    fields: [
      { key: "unet.weight_dtype", label: "UNet Data Type", type: "select-kv", options: DTYPE_WITH_A8, tooltip: "UNet weight data type" },
    ],
  };
}

function transformerSection(allowOverride: boolean): SectionDef {
  const fields: FieldDef[] = [];
  if (allowOverride) {
    fields.push({ key: "transformer.model_name", label: "Override Transformer / GGUF", type: "file", tooltip: "Override transformer. Supports safetensors and GGUF" });
  }
  fields.push({ key: "transformer.weight_dtype", label: "Transformer Data Type", type: "select-kv", options: DTYPE_WITH_GGUF_A8, tooltip: "Transformer weight data type" });
  return { id: "transformer", label: "Transformer", fields };
}

function textEncoderSection(name: string, configPrefix: string): SectionDef {
  return {
    id: configPrefix.replace(/\./g, "_"),
    label: name,
    fields: [
      { key: `${configPrefix}.weight_dtype`, label: `${name} Data Type`, type: "select-kv", options: DTYPE_OPTIONS, tooltip: `${name} weight data type` },
    ],
  };
}

function vaeSection(): SectionDef {
  return {
    id: "vae",
    label: "VAE",
    fields: [
      { key: "vae.model_name", label: "VAE Override", type: "file", tooltip: "Override VAE model" },
      { key: "vae.weight_dtype", label: "VAE Data Type", type: "select-kv", options: DTYPE_OPTIONS, tooltip: "VAE weight data type" },
    ],
  };
}

function outputSection(): SectionDef {
  return {
    id: "output",
    label: "Output",
    fields: [
      { key: "output_model_destination", label: "Model Output Destination", type: "file", tooltip: "Where to save output model" },
      { key: "output_dtype", label: "Output Data Type", type: "select-kv", options: OUTPUT_DTYPE_OPTIONS, tooltip: "Precision for saving" },
      { key: "output_model_format", label: "Output Format", type: "select", stringOptions: ["SAFETENSORS", "DIFFUSERS"] },
      { key: "include_train_config", label: "Include Config", type: "select", stringOptions: ["NONE", "SETTINGS", "ALL"], tooltip: "Include training config in output" },
    ],
  };
}

// Schema definitions per model family
const SD_SCHEMA: ModelSchema = {
  sections: [baseSection(), unetSection(), textEncoderSection("Text Encoder", "text_encoder"), quantizationSection(), vaeSection(), outputSection()],
};

const SDXL_SCHEMA: ModelSchema = {
  sections: [baseSection(), unetSection(), textEncoderSection("Text Encoder 1", "text_encoder"), textEncoderSection("Text Encoder 2", "text_encoder_2"), quantizationSection(), vaeSection(), outputSection()],
};

const SD3_SCHEMA: ModelSchema = {
  sections: [baseSection(), transformerSection(false), textEncoderSection("Text Encoder 1", "text_encoder"), textEncoderSection("Text Encoder 2", "text_encoder_2"), textEncoderSection("Text Encoder 3", "text_encoder_3"), quantizationSection(), vaeSection(), outputSection()],
};

const FLUX_SCHEMA: ModelSchema = {
  sections: [baseSection(), transformerSection(true), textEncoderSection("Text Encoder 1", "text_encoder"), textEncoderSection("Text Encoder 2", "text_encoder_2"), quantizationSection(), vaeSection(), outputSection()],
};

const FLUX2_SCHEMA: ModelSchema = {
  sections: [baseSection(), transformerSection(true), textEncoderSection("Text Encoder", "text_encoder"), quantizationSection(), vaeSection(), outputSection()],
};

const PIXART_SCHEMA: ModelSchema = {
  sections: [baseSection(), transformerSection(false), textEncoderSection("Text Encoder", "text_encoder"), quantizationSection(), vaeSection(), outputSection()],
};

const WUERSTCHEN_SCHEMA: ModelSchema = {
  sections: [
    baseSection(),
    {
      id: "prior",
      label: "Prior",
      fields: [
        { key: "prior.weight_dtype", label: "Prior Data Type", type: "select-kv", options: DTYPE_OPTIONS },
      ],
    },
    textEncoderSection("Text Encoder", "text_encoder"),
    {
      id: "effnet_encoder",
      label: "Effnet Encoder",
      fields: [
        { key: "effnet_encoder.model_name", label: "Effnet Encoder Override", type: "file", tooltip: "Override effnet encoder model" },
        { key: "effnet_encoder.weight_dtype", label: "Effnet Encoder Data Type", type: "select-kv", options: DTYPE_OPTIONS, tooltip: "Effnet encoder weight data type" },
      ],
    },
    {
      id: "decoder",
      label: "Decoder",
      fields: [
        { key: "decoder.model_name", label: "Decoder Override", type: "file", tooltip: "Override decoder model" },
        { key: "decoder.weight_dtype", label: "Decoder Data Type", type: "select-kv", options: DTYPE_OPTIONS, tooltip: "Decoder weight data type" },
      ],
    },
    {
      id: "decoder_text_encoder",
      label: "Decoder Text Encoder",
      fields: [
        { key: "decoder_text_encoder.weight_dtype", label: "Decoder Text Encoder Data Type", type: "select-kv", options: DTYPE_OPTIONS, tooltip: "Decoder text encoder weight data type" },
      ],
    },
    {
      id: "decoder_vqgan",
      label: "Decoder VQGAN",
      fields: [
        { key: "decoder_vqgan.weight_dtype", label: "Decoder VQGAN Data Type", type: "select-kv", options: DTYPE_OPTIONS, tooltip: "Decoder VQGAN weight data type" },
      ],
    },
    quantizationSection(),
    outputSection(),
  ],
};

const STABLE_CASCADE_SCHEMA: ModelSchema = {
  sections: [
    baseSection(),
    {
      id: "prior",
      label: "Prior",
      fields: [
        { key: "prior.model_name", label: "Prior Override", type: "file", tooltip: "Override prior model" },
        { key: "prior.weight_dtype", label: "Prior Data Type", type: "select-kv", options: DTYPE_OPTIONS },
      ],
    },
    textEncoderSection("Text Encoder", "text_encoder"),
    {
      id: "effnet_encoder",
      label: "Effnet Encoder",
      fields: [
        { key: "effnet_encoder.model_name", label: "Effnet Encoder Override", type: "file", tooltip: "Override effnet encoder model" },
        { key: "effnet_encoder.weight_dtype", label: "Effnet Encoder Data Type", type: "select-kv", options: DTYPE_OPTIONS, tooltip: "Effnet encoder weight data type" },
      ],
    },
    {
      id: "decoder",
      label: "Decoder",
      fields: [
        { key: "decoder.model_name", label: "Decoder Override", type: "file", tooltip: "Override decoder model" },
        { key: "decoder.weight_dtype", label: "Decoder Data Type", type: "select-kv", options: DTYPE_OPTIONS, tooltip: "Decoder weight data type" },
      ],
    },
    {
      id: "decoder_text_encoder",
      label: "Decoder Text Encoder",
      fields: [
        { key: "decoder_text_encoder.weight_dtype", label: "Decoder Text Encoder Data Type", type: "select-kv", options: DTYPE_OPTIONS, tooltip: "Decoder text encoder weight data type" },
      ],
    },
    {
      id: "decoder_vqgan",
      label: "Decoder VQGAN",
      fields: [
        { key: "decoder_vqgan.weight_dtype", label: "Decoder VQGAN Data Type", type: "select-kv", options: DTYPE_OPTIONS, tooltip: "Decoder VQGAN weight data type" },
      ],
    },
    quantizationSection(),
    outputSection(),
  ],
};

const HUNYUAN_SCHEMA: ModelSchema = {
  sections: [baseSection(), transformerSection(true), textEncoderSection("Text Encoder 1", "text_encoder"), textEncoderSection("Text Encoder 2", "text_encoder_2"), quantizationSection(), vaeSection(), outputSection()],
};

const HI_DREAM_SCHEMA: ModelSchema = {
  sections: [
    baseSection(),
    transformerSection(false),
    textEncoderSection("Text Encoder 1", "text_encoder"),
    textEncoderSection("Text Encoder 2", "text_encoder_2"),
    textEncoderSection("Text Encoder 3", "text_encoder_3"),
    {
      id: "text_encoder_4",
      label: "Text Encoder 4",
      fields: [
        { key: "text_encoder_4.model_name", label: "Text Encoder 4 Override", type: "file", tooltip: "Override text encoder 4 model" },
        { key: "text_encoder_4.weight_dtype", label: "Text Encoder 4 Data Type", type: "select-kv", options: DTYPE_OPTIONS, tooltip: "Text Encoder 4 weight data type" },
      ],
    },
    quantizationSection(),
    vaeSection(),
    outputSection(),
  ],
};

export function getModelSchema(modelType: ModelType): ModelSchema {
  // SD 1.5 variants
  if (modelType.startsWith("STABLE_DIFFUSION_15") || modelType.startsWith("STABLE_DIFFUSION_20") || modelType.startsWith("STABLE_DIFFUSION_21")) return SD_SCHEMA;
  // SDXL
  if (modelType.startsWith("STABLE_DIFFUSION_XL")) return SDXL_SCHEMA;
  // SD3
  if (modelType === "STABLE_DIFFUSION_3" || modelType === "STABLE_DIFFUSION_35") return SD3_SCHEMA;
  // Flux 1
  if (modelType === "FLUX_DEV_1" || modelType === "FLUX_FILL_DEV_1") return FLUX_SCHEMA;
  // Flux 2, Z-Image, Chroma, Qwen
  if (modelType === "FLUX_2" || modelType === "Z_IMAGE" || modelType === "CHROMA_1" || modelType === "QWEN") return FLUX2_SCHEMA;
  // Pixart, Sana
  if (modelType === "PIXART_ALPHA" || modelType === "PIXART_SIGMA" || modelType === "SANA") return PIXART_SCHEMA;
  // Wuerstchen, Stable Cascade
  if (modelType === "WUERSTCHEN_2") return WUERSTCHEN_SCHEMA;
  if (modelType === "STABLE_CASCADE_1") return STABLE_CASCADE_SCHEMA;
  // Hunyuan Video
  if (modelType === "HUNYUAN_VIDEO") return HUNYUAN_SCHEMA;
  // HiDream
  if (modelType === "HI_DREAM_FULL") return HI_DREAM_SCHEMA;
  // Fallback
  return SD_SCHEMA;
}
