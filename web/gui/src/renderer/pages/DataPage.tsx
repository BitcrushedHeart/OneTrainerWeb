import { SectionCard, Toggle } from "@/components/shared";

export default function DataPage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Data Settings">
        <div className="flex flex-col gap-4">
          <Toggle
            configPath="aspect_ratio_bucketing"
            label="Aspect Ratio Bucketing"
            tooltip="Enable aspect ratio bucketing for variable-size images"
          />
          <Toggle
            configPath="latent_caching"
            label="Latent Caching"
            tooltip="Cache latent representations for faster training"
          />
          <Toggle
            configPath="clear_cache_before_training"
            label="Clear Cache Before Training"
            tooltip="Clear cached data before starting training"
          />
        </div>
      </SectionCard>
    </div>
  );
}
