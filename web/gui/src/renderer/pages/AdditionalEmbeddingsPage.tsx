import { Card, FormEntry, FilePicker, Toggle, TimeEntry, Button, SelectKV, ArrayItemHeader } from "@/components/shared";
import { DTYPE_SUBSETS } from "@/types/generated/dataTypeSubsets";
import { Plus } from "lucide-react";
import { useArrayField } from "@/hooks/useArrayField";
import type { TrainEmbeddingConfig } from "@/types/generated/config";
import { useCallback } from "react";

function createDefaultEmbedding(): TrainEmbeddingConfig {
  return {
    uuid: crypto.randomUUID(),
    model_name: "",
    placeholder: "<embedding>",
    train: true,
    stop_training_after: null,
    stop_training_after_unit: "NEVER",
    token_count: 1,
    initial_embedding_text: "*",
    is_output_embedding: false,
  };
}

const prepareClone = (e: TrainEmbeddingConfig) => ({ ...e, uuid: crypto.randomUUID() });

export default function AdditionalEmbeddingsPage() {
  const { items: embeddings, add, remove, clone } = useArrayField<TrainEmbeddingConfig>({
    path: "additional_embeddings",
    createDefault: useCallback(createDefaultEmbedding, []),
    prepareClone,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-[var(--color-on-surface)]">Additional Embeddings</h3>
        <Button variant="secondary" size="sm" onClick={add}>
          <Plus className="w-4 h-4" /> Add Embedding
        </Button>
      </div>

      {embeddings.length === 0 && (
        <Card>
          <p className="text-sm text-[var(--color-on-surface-secondary)] text-center py-8">
            No additional embeddings. Click &quot;Add Embedding&quot; to create one.
          </p>
        </Card>
      )}

      {embeddings.map((emb, i) => (
        <Card key={emb.uuid} padding="md">
          <ArrayItemHeader title={`Embedding ${i + 1}`} onClone={() => clone(i)} onRemove={() => remove(i)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FilePicker label="Base Embedding" configPath={`additional_embeddings.${i}.model_name`} />
            <FormEntry label="Placeholder" configPath={`additional_embeddings.${i}.placeholder`} />
            <FormEntry
              label="Token Count"
              configPath={`additional_embeddings.${i}.token_count`}
              type="number"
              nullable
            />
            <FormEntry
              label="Initial Embedding Text"
              configPath={`additional_embeddings.${i}.initial_embedding_text`}
            />
            <SelectKV
              label="Weight Data Type"
              configPath={`additional_embeddings.${i}.weight_dtype`}
              options={DTYPE_SUBSETS.embedding_weight}
            />
            <Toggle configPath={`additional_embeddings.${i}.train`} label="Train" />
            <Toggle configPath={`additional_embeddings.${i}.is_output_embedding`} label="Output Embedding" />
            <TimeEntry
              label="Stop Training After"
              valuePath={`additional_embeddings.${i}.stop_training_after`}
              unitPath={`additional_embeddings.${i}.stop_training_after_unit`}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
