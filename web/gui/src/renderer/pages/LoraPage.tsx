import { SectionCard, FormEntry, FilePicker, Toggle, SelectKV } from "@/components/shared";
import { useConfigField } from "@/hooks/useConfigField";
import type { PeftType } from "@/types/generated/enums";

export default function LoraPage() {
  const [peftType, setPeftType] = useConfigField<PeftType>("peft_type");
  const current = peftType ?? "LORA";
  const name = current === "LOHA" ? "LoHa" : current === "OFT_2" ? "OFT v2" : "LoRA";

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Type">
        <SelectKV
          label="PEFT Type"
          options={[
            { label: "LoRA", value: "LORA" },
            { label: "LoHa", value: "LOHA" },
            { label: "OFT v2", value: "OFT_2" },
          ]}
          value={current}
          onChange={(v) => setPeftType(v as PeftType)}
          tooltip="Low-parameter finetuning method"
        />
      </SectionCard>

      <SectionCard title={`${name} Settings`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <FilePicker
              label={`${name} Base Model`}
              configPath="lora_model_name"
              tooltip={`Base ${name} to train on. Leave empty to create new`}
            />
          </div>

          {(current === "LORA" || current === "LOHA") && (
            <>
              <FormEntry
                label={`${name} Rank`}
                configPath="lora_rank"
                type="number"
                tooltip={`Rank parameter for ${name}`}
              />
              <FormEntry
                label={`${name} Alpha`}
                configPath="lora_alpha"
                type="number"
                tooltip={`Alpha parameter for ${name}`}
              />
              <FormEntry
                label="Dropout Probability"
                configPath="dropout_probability"
                type="number"
                tooltip="Dropout probability (0-1)"
              />
              <SelectKV
                label={`${name} Weight Data Type`}
                configPath="lora_weight_dtype"
                options={[
                  { label: "float32", value: "FLOAT_32" },
                  { label: "bfloat16", value: "BFLOAT_16" },
                ]}
              />
              <Toggle
                configPath="bundle_additional_embeddings"
                label="Bundle Embeddings"
                tooltip="Bundle embeddings into the output file"
              />
            </>
          )}

          {current === "LORA" && (
            <>
              <Toggle
                configPath="lora_decompose"
                label="Decompose Weights (DoRA)"
                tooltip="Enable DoRA weight decomposition"
              />
              <Toggle
                configPath="lora_decompose_norm_epsilon"
                label="Use Norm Epsilon (DoRA)"
                tooltip="Add epsilon to norm in DoRA"
              />
              <Toggle
                configPath="lora_decompose_output_axis"
                label="Output Axis (DoRA)"
                tooltip="Apply decomposition on output axis"
              />
            </>
          )}

          {current === "OFT_2" && (
            <>
              <FormEntry
                label="Block Size"
                configPath="oft_block_size"
                type="number"
                tooltip="OFT block size parameter"
              />
              <FormEntry label="Dropout Probability" configPath="dropout_probability" type="number" />
              <Toggle
                configPath="oft_coft"
                label="Constrained OFT (COFT)"
                tooltip="Use constrained OFT variant"
              />
              <FormEntry
                label="COFT Epsilon"
                configPath="coft_eps"
                type="number"
                tooltip="COFT control strength"
              />
              <Toggle
                configPath="oft_block_share"
                label="Block Share"
                tooltip="Share OFT parameters between blocks"
              />
              <SelectKV
                label="Weight Data Type"
                configPath="lora_weight_dtype"
                options={[
                  { label: "float32", value: "FLOAT_32" },
                  { label: "bfloat16", value: "BFLOAT_16" },
                ]}
              />
              <Toggle configPath="bundle_additional_embeddings" label="Bundle Embeddings" />
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
