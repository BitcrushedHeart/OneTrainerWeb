import { SectionCard, FormEntry, FilePicker, Toggle, SelectKV } from "@/components/shared";

export default function EmbeddingPage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Embedding Settings">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FilePicker
            label="Base Embedding"
            configPath="embedding.model_name"
            tooltip="Base embedding file to train on"
          />
          <FormEntry label="Placeholder" configPath="embedding.placeholder" tooltip="Placeholder token" />
          <FormEntry
            label="Token Count"
            configPath="embedding.token_count"
            type="number"
            nullable
            tooltip="Number of tokens"
          />
          <FormEntry
            label="Initial Embedding Text"
            configPath="embedding.initial_embedding_text"
            tooltip="Text to initialize embedding from"
          />
          <SelectKV
            label="Weight Data Type"
            configPath="embedding_weight_dtype"
            options={[
              { label: "float32", value: "FLOAT_32" },
              { label: "bfloat16", value: "BFLOAT_16" },
            ]}
          />
          <Toggle
            configPath="embedding.is_output_embedding"
            label="Output Embedding"
            tooltip="Use as output embedding"
          />
        </div>
      </SectionCard>
    </div>
  );
}
