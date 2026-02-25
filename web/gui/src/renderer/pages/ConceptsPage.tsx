import { useState, useCallback } from "react";
import { ConceptGrid } from "@/components/concepts/ConceptGrid";
import { ConceptEditorModal } from "@/components/modals/ConceptEditorModal";
import { useConfigField } from "@/hooks/useConfigField";
import type { ConceptConfig } from "@/types/generated/config";

const DEFAULT_CONCEPT: ConceptConfig = {
  name: "",
  path: "",
  seed: 42,
  enabled: true,
  type: "STANDARD",
  include_subdirectories: false,
  image_variations: 1,
  text_variations: 1,
  balancing: 1,
  balancing_strategy: "REPEATS",
  loss_weight: 1.0,
  concept_stats: {},
  image: {
    enable_crop_jitter: true,
    enable_random_flip: false,
    enable_fixed_flip: false,
    enable_random_rotate: false,
    enable_fixed_rotate: false,
    random_rotate_max_angle: 0,
    enable_random_brightness: false,
    enable_fixed_brightness: false,
    random_brightness_max_strength: 0,
    enable_random_contrast: false,
    enable_fixed_contrast: false,
    random_contrast_max_strength: 0,
    enable_random_saturation: false,
    enable_fixed_saturation: false,
    random_saturation_max_strength: 0,
    enable_random_hue: false,
    enable_fixed_hue: false,
    random_hue_max_strength: 0,
    enable_resolution_override: false,
    resolution_override: "",
    enable_random_circular_mask_shrink: false,
    enable_random_mask_rotate_crop: false,
  },
  text: {
    prompt_source: "sample",
    prompt_path: "",
    enable_tag_shuffling: false,
    tag_delimiter: ",",
    keep_tags_count: 1,
    tag_dropout_enable: false,
    tag_dropout_mode: "RANDOM",
    tag_dropout_probability: 0,
    tag_dropout_special_tags_mode: "NONE",
    tag_dropout_special_tags: "",
    tag_dropout_special_tags_regex: false,
    caps_randomize_enable: false,
    caps_randomize_mode: "",
    caps_randomize_probability: 0,
    caps_randomize_lowercase: false,
  },
};

export default function ConceptsPage() {
  const [concepts, setConcepts] = useConfigField<ConceptConfig[] | null>("concepts");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const list = concepts ?? [];

  const handleAdd = useCallback(() => {
    const next = [...list, { ...JSON.parse(JSON.stringify(DEFAULT_CONCEPT)), seed: Math.floor(Math.random() * 2 ** 30) }];
    setConcepts(next);
  }, [list, setConcepts]);

  const handleRemove = useCallback((index: number) => {
    setConcepts(list.filter((_, i) => i !== index));
  }, [list, setConcepts]);

  const handleClone = useCallback((index: number) => {
    const cloned = JSON.parse(JSON.stringify(list[index])) as ConceptConfig;
    cloned.seed = Math.floor(Math.random() * 2 ** 30);
    const next = [...list];
    next.splice(index + 1, 0, cloned);
    setConcepts(next);
  }, [list, setConcepts]);

  const handleToggle = useCallback((index: number, enabled: boolean) => {
    const next = list.map((c, i) => (i === index ? { ...c, enabled } : c));
    setConcepts(next);
  }, [list, setConcepts]);

  const handleOpen = useCallback((index: number) => {
    setEditingIndex(index);
    setEditorOpen(true);
  }, []);

  const handleSave = useCallback((updated: ConceptConfig) => {
    if (editingIndex === null) return;
    const next = list.map((c, i) => (i === editingIndex ? updated : c));
    setConcepts(next);
  }, [editingIndex, list, setConcepts]);

  return (
    <>
      <ConceptGrid
        concepts={list}
        onAdd={handleAdd}
        onOpen={handleOpen}
        onRemove={handleRemove}
        onClone={handleClone}
        onToggle={handleToggle}
      />
      <ConceptEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        concept={editingIndex !== null ? list[editingIndex] ?? null : null}
        onSave={handleSave}
      />
    </>
  );
}
