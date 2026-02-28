import { FormEntry, Toggle, Select, DirPicker, FilePicker } from "@/components/shared";
import type { ConceptConfig } from "@/types/generated/config";
import { ConceptTypeValues, BalancingStrategyValues } from "@/types/generated/enums";

const PROMPT_SOURCE_OPTIONS = ["sample", "concept", "filename"];
const PROMPT_SOURCE_LABELS: Record<string, string> = {
  sample: "From text file per sample",
  concept: "From single text file",
  filename: "From image file name",
};

export interface ConceptGeneralTabProps {
  draft: ConceptConfig;
  update: (path: string, value: unknown) => void;
  updateText: (field: keyof ConceptConfig["text"], value: unknown) => void;
}

export function ConceptGeneralTab({ draft, update, updateText }: ConceptGeneralTabProps) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-3 items-center">
      {/* Name */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Name</span>
      <FormEntry label="" value={draft.name} onChange={(v) => update("name", v)} />

      {/* Enabled */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Enabled</span>
      <Toggle value={draft.enabled} onChange={(v) => update("enabled", v)} />

      {/* Concept Type */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Concept Type</span>
      <Select
        label=""
        options={ConceptTypeValues}
        value={draft.type}
        onChange={(v) => update("type", v)}
      />

      {/* Path */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Path</span>
      <DirPicker
        label=""
        value={draft.path}
        onChange={(v) => update("path", v)}
        tooltip="Directory containing training images"
      />

      {/* Prompt Source */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Prompt Source</span>
      <Select
        label=""
        options={PROMPT_SOURCE_OPTIONS}
        value={draft.text.prompt_source}
        onChange={(v) => updateText("prompt_source", v)}
        formatLabel={(v) => PROMPT_SOURCE_LABELS[v] ?? v}
      />

      {/* Prompt Path (always rendered, disabled when not "concept") */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Prompt Path</span>
      <FilePicker
        label=""
        value={draft.text.prompt_path}
        onChange={(v) => updateText("prompt_path", v)}
        disabled={draft.text.prompt_source !== "concept"}
      />

      {/* Include Subdirectories */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Include Subdirectories</span>
      <Toggle value={draft.include_subdirectories} onChange={(v) => update("include_subdirectories", v)} />

      {/* Image Variations */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Image Variations</span>
      <FormEntry
        label=""
        type="number"
        value={draft.image_variations}
        onChange={(v) => update("image_variations", v)}
      />

      {/* Text Variations */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Text Variations</span>
      <FormEntry
        label=""
        type="number"
        value={draft.text_variations}
        onChange={(v) => update("text_variations", v)}
      />

      {/* Balancing + Strategy */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Balancing</span>
      <div className="flex gap-2">
        <div className="flex-1">
          <FormEntry
            label=""
            type="number"
            value={draft.balancing}
            onChange={(v) => update("balancing", v)}
          />
        </div>
        <div className="w-36">
          <Select
            label=""
            options={BalancingStrategyValues}
            value={draft.balancing_strategy}
            onChange={(v) => update("balancing_strategy", v)}
          />
        </div>
      </div>

      {/* Loss Weight */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Loss Weight</span>
      <FormEntry
        label=""
        type="number"
        value={draft.loss_weight}
        onChange={(v) => update("loss_weight", v)}
      />

      {/* Seed */}
      <span className="text-sm font-medium text-[var(--color-on-surface)]">Seed</span>
      <FormEntry
        label=""
        type="number"
        value={draft.seed}
        onChange={(v) => update("seed", v)}
      />
    </div>
  );
}
