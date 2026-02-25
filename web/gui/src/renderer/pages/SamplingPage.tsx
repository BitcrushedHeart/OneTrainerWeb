import { useState, useCallback } from "react";
import { SectionCard, Card, FormEntry, Toggle, TimeEntry, Select, Button, ArrayItemHeader, IconButton } from "@/components/shared";
import { ImageFormatValues, VideoFormatValues, AudioFormatValues, NoiseSchedulerValues } from "@/types/generated/enums";
import { Plus, Settings } from "lucide-react";
import { useArrayField } from "@/hooks/useArrayField";
import type { SampleConfig } from "@/types/generated/config";
import { SampleParamsModal } from "@/components/modals/SampleParamsModal";
import { ManualSamplingModal } from "@/components/modals/ManualSamplingModal";
import { useTrainingStore } from "@/store/trainingStore";

function createDefaultSample(): SampleConfig {
  return {
    enabled: true,
    prompt: "",
    negative_prompt: "",
    height: 512,
    width: 512,
    frames: 1,
    length: 10,
    seed: 42,
    random_seed: false,
    diffusion_steps: 20,
    cfg_scale: 7,
    noise_scheduler: "DDIM",
    text_encoder_1_layer_skip: 0,
    text_encoder_1_sequence_length: null,
    text_encoder_2_layer_skip: 0,
    text_encoder_2_sequence_length: null,
    text_encoder_3_layer_skip: 0,
    text_encoder_4_layer_skip: 0,
    transformer_attention_mask: false,
    force_last_timestep: false,
    sample_inpainting: false,
    base_image_path: "",
    mask_image_path: "",
  };
}

export default function SamplingPage() {
  const { items: sampleList, add, remove, clone } = useArrayField<SampleConfig>({
    path: "samples",
    createDefault: useCallback(createDefaultSample, []),
  });

  const [advancedSampleIndex, setAdvancedSampleIndex] = useState<number | null>(null);
  const [manualSampleOpen, setManualSampleOpen] = useState(false);
  const status = useTrainingStore((s) => s.status);
  const sampleNow = useTrainingStore((s) => s.sampleNow);
  const isActive = status === "training" || status === "preparing";

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Sampling Settings">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <TimeEntry label="Sample After" valuePath="sample_after" unitPath="sample_after_unit" />
          <FormEntry label="Skip First" configPath="sample_skip_first" type="number" />
          <Select label="Image Format" configPath="sample_image_format" options={[...ImageFormatValues]} />
          <Select label="Video Format" configPath="sample_video_format" options={[...VideoFormatValues]} />
          <Select label="Audio Format" configPath="sample_audio_format" options={[...AudioFormatValues]} />
        </div>
        <div className="flex gap-4 mt-4">
          <Toggle configPath="non_ema_sampling" label="Non-EMA Sampling" />
          <Toggle configPath="samples_to_tensorboard" label="Samples to Tensorboard" />
        </div>
        <div className="flex gap-3 mt-4">
          <Button variant="secondary" disabled={!isActive} onClick={sampleNow}>
            Sample Now
          </Button>
          <Button variant="secondary" onClick={() => setManualSampleOpen(true)}>
            Manual Sample
          </Button>
        </div>
      </SectionCard>

      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-on-surface-secondary)]">Sample Definitions</h3>
        <Button variant="secondary" size="sm" onClick={add}>
          <Plus className="w-4 h-4" /> Add Sample
        </Button>
      </div>

      {sampleList.length === 0 && (
        <Card>
          <p className="text-sm text-[var(--color-on-surface-secondary)] text-center py-8">
            No samples defined. Click &quot;Add Sample&quot; to create one.
          </p>
        </Card>
      )}

      {sampleList.map((_, i) => (
        <Card key={i} padding="md">
          <ArrayItemHeader title={`Sample ${i + 1}`} onClone={() => clone(i)} onRemove={() => remove(i)}>
            <Toggle configPath={`samples.${i}.enabled`} />
            <IconButton
              icon={<Settings className="w-full h-full" />}
              label="Advanced parameters"
              variant="ghost"
              size="sm"
              onClick={() => setAdvancedSampleIndex(i)}
            />
          </ArrayItemHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormEntry label="Width" configPath={`samples.${i}.width`} type="number" />
            <FormEntry label="Height" configPath={`samples.${i}.height`} type="number" />
            <FormEntry label="Seed" configPath={`samples.${i}.seed`} type="number" />
            <div className="md:col-span-2 lg:col-span-3">
              <FormEntry label="Prompt" configPath={`samples.${i}.prompt`} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <FormEntry label="Negative Prompt" configPath={`samples.${i}.negative_prompt`} />
            </div>
            <FormEntry label="Diffusion Steps" configPath={`samples.${i}.diffusion_steps`} type="number" />
            <FormEntry label="CFG Scale" configPath={`samples.${i}.cfg_scale`} type="number" />
            <Select
              label="Noise Scheduler"
              configPath={`samples.${i}.noise_scheduler`}
              options={[...NoiseSchedulerValues]}
            />
          </div>
        </Card>
      ))}

      {advancedSampleIndex !== null && (
        <SampleParamsModal
          open={true}
          onClose={() => setAdvancedSampleIndex(null)}
          sampleIndex={advancedSampleIndex}
        />
      )}
      <ManualSamplingModal open={manualSampleOpen} onClose={() => setManualSampleOpen(false)} />
    </div>
  );
}
