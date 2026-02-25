import { useState, useEffect } from "react";
import { ModalBase } from "./ModalBase";
import { Button, FormEntry, Toggle, Select, DirPicker, FilePicker } from "@/components/shared";
import type { ConceptConfig } from "@/types/generated/config";
import { ConceptTypeValues, BalancingStrategyValues } from "@/types/generated/enums";

export interface ConceptEditorModalProps {
  open: boolean;
  onClose: () => void;
  concept: ConceptConfig | null;
  onSave: (updated: ConceptConfig) => void;
}

type Tab = "general" | "image_aug" | "text_aug" | "statistics";

const tabs: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "image_aug", label: "Image Augmentation" },
  { id: "text_aug", label: "Text Augmentation" },
  { id: "statistics", label: "Statistics" },
];

const PROMPT_SOURCE_OPTIONS = ["sample", "concept", "filename"];
const PROMPT_SOURCE_LABELS: Record<string, string> = {
  sample: "From text file per sample",
  concept: "From single text file",
  filename: "From image file name",
};

const TAG_DROPOUT_MODE_OPTIONS = ["FULL", "RANDOM", "RANDOM WEIGHTED"];
const TAG_DROPOUT_SPECIAL_TAGS_MODE_OPTIONS = ["NONE", "BLACKLIST", "WHITELIST"];

export function ConceptEditorModal({ open, onClose, concept, onSave }: ConceptEditorModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [draft, setDraft] = useState<ConceptConfig | null>(null);

  useEffect(() => {
    if (open && concept) {
      setDraft(JSON.parse(JSON.stringify(concept)));
      setActiveTab("general");
    }
  }, [open, concept]);

  if (!draft) return null;

  const update = (path: string, value: unknown) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as ConceptConfig;
      const keys = path.split(".");
      let obj: Record<string, unknown> = next as unknown as Record<string, unknown>;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]] as Record<string, unknown>;
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const updateImage = (field: keyof ConceptConfig["image"], value: unknown) => update(`image.${field}`, value);
  const updateText = (field: keyof ConceptConfig["text"], value: unknown) => update(`text.${field}`, value);

  const handleSave = () => { if (draft) { onSave(draft); onClose(); } };

  return (
    <ModalBase open={open} onClose={onClose} title={`Edit: ${draft.name || "Concept"}`} size="xl" closeOnBackdrop={false}>
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-[var(--color-border-subtle)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
              activeTab === tab.id
                ? "text-[var(--color-orchid-600)] border-b-2 border-[var(--color-orchid-600)]"
                : "text-[var(--color-on-surface-secondary)] hover:text-[var(--color-on-surface)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px] max-h-[60vh] overflow-y-auto">
        {activeTab === "general" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormEntry
              label="Name"
              value={draft.name}
              onChange={(v) => update("name", v)}
            />
            <div className="flex flex-col gap-1">
              <Toggle
                label="Enabled"
                labelPosition="right"
                value={draft.enabled}
                onChange={(v) => update("enabled", v)}
              />
            </div>
            <Select
              label="Concept Type"
              options={ConceptTypeValues}
              value={draft.type}
              onChange={(v) => update("type", v)}
            />
            <DirPicker
              label="Path"
              value={draft.path}
              onChange={(v) => update("path", v)}
              tooltip="Directory containing training images"
            />
            <Select
              label="Prompt Source"
              options={PROMPT_SOURCE_OPTIONS}
              value={draft.text.prompt_source}
              onChange={(v) => updateText("prompt_source", v)}
              formatLabel={(v) => PROMPT_SOURCE_LABELS[v] ?? v}
            />
            {draft.text.prompt_source === "concept" && (
              <FilePicker
                label="Prompt Path"
                value={draft.text.prompt_path}
                onChange={(v) => updateText("prompt_path", v)}
              />
            )}
            <div className="flex flex-col gap-1">
              <Toggle
                label="Include Subdirectories"
                labelPosition="right"
                value={draft.include_subdirectories}
                onChange={(v) => update("include_subdirectories", v)}
              />
            </div>
            <FormEntry
              label="Image Variations"
              type="number"
              value={draft.image_variations}
              onChange={(v) => update("image_variations", v)}
            />
            <FormEntry
              label="Text Variations"
              type="number"
              value={draft.text_variations}
              onChange={(v) => update("text_variations", v)}
            />
            {/* Balancing: number + strategy select side by side */}
            <div className="flex flex-col gap-1">
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
            </div>
            <FormEntry
              label="Loss Weight"
              type="number"
              value={draft.loss_weight}
              onChange={(v) => update("loss_weight", v)}
            />
            <FormEntry
              label="Seed"
              type="number"
              value={draft.seed}
              onChange={(v) => update("seed", v)}
            />
          </div>
        )}

        {activeTab === "image_aug" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center text-xs font-semibold text-[var(--color-on-surface-secondary)] uppercase">
              <span>Augmentation</span><span>Random</span><span>Fixed</span><span>Value</span>
            </div>
            {/* Crop Jitter */}
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Crop Jitter</span>
              <Toggle value={draft.image.enable_crop_jitter} onChange={(v) => updateImage("enable_crop_jitter", v)} />
              <span></span><span></span>
            </div>
            {/* Random Flip */}
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Random Flip</span>
              <Toggle value={draft.image.enable_random_flip} onChange={(v) => updateImage("enable_random_flip", v)} />
              <Toggle value={draft.image.enable_fixed_flip} onChange={(v) => updateImage("enable_fixed_flip", v)} />
              <span></span>
            </div>
            {/* Random Rotation */}
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Random Rotation</span>
              <Toggle value={draft.image.enable_random_rotate} onChange={(v) => updateImage("enable_random_rotate", v)} />
              <Toggle value={draft.image.enable_fixed_rotate} onChange={(v) => updateImage("enable_fixed_rotate", v)} />
              <FormEntry
                label=""
                type="number"
                value={draft.image.random_rotate_max_angle}
                onChange={(v) => updateImage("random_rotate_max_angle", v)}
                placeholder="Max angle"
              />
            </div>
            {/* Random Brightness */}
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Random Brightness</span>
              <Toggle value={draft.image.enable_random_brightness} onChange={(v) => updateImage("enable_random_brightness", v)} />
              <Toggle value={draft.image.enable_fixed_brightness} onChange={(v) => updateImage("enable_fixed_brightness", v)} />
              <FormEntry
                label=""
                type="number"
                value={draft.image.random_brightness_max_strength}
                onChange={(v) => updateImage("random_brightness_max_strength", v)}
                placeholder="Max strength"
              />
            </div>
            {/* Random Contrast */}
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Random Contrast</span>
              <Toggle value={draft.image.enable_random_contrast} onChange={(v) => updateImage("enable_random_contrast", v)} />
              <Toggle value={draft.image.enable_fixed_contrast} onChange={(v) => updateImage("enable_fixed_contrast", v)} />
              <FormEntry
                label=""
                type="number"
                value={draft.image.random_contrast_max_strength}
                onChange={(v) => updateImage("random_contrast_max_strength", v)}
                placeholder="Max strength"
              />
            </div>
            {/* Random Saturation */}
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Random Saturation</span>
              <Toggle value={draft.image.enable_random_saturation} onChange={(v) => updateImage("enable_random_saturation", v)} />
              <Toggle value={draft.image.enable_fixed_saturation} onChange={(v) => updateImage("enable_fixed_saturation", v)} />
              <FormEntry
                label=""
                type="number"
                value={draft.image.random_saturation_max_strength}
                onChange={(v) => updateImage("random_saturation_max_strength", v)}
                placeholder="Max strength"
              />
            </div>
            {/* Random Hue */}
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Random Hue</span>
              <Toggle value={draft.image.enable_random_hue} onChange={(v) => updateImage("enable_random_hue", v)} />
              <Toggle value={draft.image.enable_fixed_hue} onChange={(v) => updateImage("enable_fixed_hue", v)} />
              <FormEntry
                label=""
                type="number"
                value={draft.image.random_hue_max_strength}
                onChange={(v) => updateImage("random_hue_max_strength", v)}
                placeholder="Max strength"
              />
            </div>
            {/* Circular Mask */}
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Circular Mask Generation</span>
              <Toggle value={draft.image.enable_random_circular_mask_shrink} onChange={(v) => updateImage("enable_random_circular_mask_shrink", v)} />
              <span></span><span></span>
            </div>
            {/* Rotate and Crop */}
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Random Rotate & Crop</span>
              <Toggle value={draft.image.enable_random_mask_rotate_crop} onChange={(v) => updateImage("enable_random_mask_rotate_crop", v)} />
              <span></span><span></span>
            </div>
            {/* Resolution Override */}
            <div className="grid grid-cols-[1fr_60px_60px_1fr] gap-2 items-center">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Resolution Override</span>
              <span></span>
              <Toggle value={draft.image.enable_resolution_override} onChange={(v) => updateImage("enable_resolution_override", v)} />
              <FormEntry
                label=""
                value={draft.image.resolution_override}
                onChange={(v) => updateImage("resolution_override", v)}
                placeholder="e.g. 512 or 768x512"
              />
            </div>
          </div>
        )}

        {activeTab === "text_aug" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <Toggle
                  label="Tag Shuffling"
                  labelPosition="right"
                  value={draft.text.enable_tag_shuffling}
                  onChange={(v) => updateText("enable_tag_shuffling", v)}
                />
              </div>
              <FormEntry
                label="Tag Delimiter"
                value={draft.text.tag_delimiter}
                onChange={(v) => updateText("tag_delimiter", v)}
              />
              <FormEntry
                label="Keep Tag Count"
                type="number"
                value={draft.text.keep_tags_count}
                onChange={(v) => updateText("keep_tags_count", v)}
              />
            </div>

            <h4 className="text-sm font-semibold text-[var(--color-on-surface-secondary)] uppercase mt-2">Tag Dropout</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <Toggle
                  label="Enable Tag Dropout"
                  labelPosition="right"
                  value={draft.text.tag_dropout_enable}
                  onChange={(v) => updateText("tag_dropout_enable", v)}
                />
              </div>
              <Select
                label="Dropout Mode"
                options={TAG_DROPOUT_MODE_OPTIONS}
                value={draft.text.tag_dropout_mode}
                onChange={(v) => updateText("tag_dropout_mode", v)}
              />
              <FormEntry
                label="Dropout Probability"
                type="number"
                value={draft.text.tag_dropout_probability}
                onChange={(v) => updateText("tag_dropout_probability", v)}
              />
              <Select
                label="Special Tags Mode"
                options={TAG_DROPOUT_SPECIAL_TAGS_MODE_OPTIONS}
                value={draft.text.tag_dropout_special_tags_mode}
                onChange={(v) => updateText("tag_dropout_special_tags_mode", v)}
              />
              <FormEntry
                label="Special Tags"
                value={draft.text.tag_dropout_special_tags}
                onChange={(v) => updateText("tag_dropout_special_tags", v)}
              />
              <div className="flex flex-col gap-1">
                <Toggle
                  label="Special Tags Regex"
                  labelPosition="right"
                  value={draft.text.tag_dropout_special_tags_regex}
                  onChange={(v) => updateText("tag_dropout_special_tags_regex", v)}
                />
              </div>
            </div>

            <h4 className="text-sm font-semibold text-[var(--color-on-surface-secondary)] uppercase mt-2">Capitalization</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <Toggle
                  label="Randomize Capitalization"
                  labelPosition="right"
                  value={draft.text.caps_randomize_enable}
                  onChange={(v) => updateText("caps_randomize_enable", v)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Toggle
                  label="Force Lowercase"
                  labelPosition="right"
                  value={draft.text.caps_randomize_lowercase}
                  onChange={(v) => updateText("caps_randomize_lowercase", v)}
                />
              </div>
              <FormEntry
                label="Capitalization Mode"
                value={draft.text.caps_randomize_mode}
                onChange={(v) => updateText("caps_randomize_mode", v)}
                placeholder="capslock,title,first,random"
              />
              <FormEntry
                label="Capitalization Probability"
                type="number"
                value={draft.text.caps_randomize_probability}
                onChange={(v) => updateText("caps_randomize_probability", v)}
              />
            </div>
          </div>
        )}

        {activeTab === "statistics" && (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--color-on-surface-secondary)]">
            <p className="text-sm">Concept statistics will be available when connected to the training backend.</p>
            <p className="text-xs mt-2">Statistics include: image count, resolution distribution, caption lengths, aspect ratio buckets.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={handleSave}>Save</Button>
      </div>
    </ModalBase>
  );
}
