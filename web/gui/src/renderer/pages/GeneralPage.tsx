import { useState } from "react";
import { SectionCard, FormEntry, DirPicker, Toggle, TimeEntry, Select } from "@/components/shared";
import { GradientReducePrecisionValues } from "@/types/generated/enums";
import { toolsApi } from "@/api/toolsApi";
import { Bug, Loader2 } from "lucide-react";

export default function GeneralPage() {
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugStatus, setDebugStatus] = useState<string | null>(null);

  const handleDebugPackage = async () => {
    setDebugLoading(true);
    setDebugStatus(null);
    try {
      const filename = await toolsApi.downloadDebugPackage();
      setDebugStatus(`Saved: ${filename}`);
    } catch (err) {
      setDebugStatus(err instanceof Error ? err.message : "Failed to generate debug package");
    } finally {
      setDebugLoading(false);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Workspace">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DirPicker label="Workspace Directory" configPath="workspace_dir" tooltip="Directory for workspace files" />
          <DirPicker label="Cache Directory" configPath="cache_dir" tooltip="Directory for cached data" />
          <Toggle
            configPath="continue_last_backup"
            label="Continue From Last Backup"
            tooltip="Continue training from the last backup"
          />
          <Toggle configPath="only_cache" label="Only Cache" tooltip="Only cache latents, do not train" />
          <Toggle
            configPath="prevent_overwrites"
            label="Prevent Overwrites"
            tooltip="Prevent accidental overwriting of model output files"
          />
        </div>
      </SectionCard>

      <SectionCard title="Tensorboard">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Toggle configPath="tensorboard" label="Tensorboard" />
          <Toggle configPath="tensorboard_always_on" label="Always-On Tensorboard" />
          <Toggle configPath="tensorboard_expose" label="Expose Tensorboard" />
          <FormEntry label="Tensorboard Port" configPath="tensorboard_port" type="number" />
        </div>
      </SectionCard>

      <SectionCard title="Validation">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Toggle configPath="validation" label="Enable Validation" tooltip="Enable validation during training" />
          <TimeEntry
            label="Validate After"
            valuePath="validate_after"
            unitPath="validate_after_unit"
            tooltip="When to run validation"
          />
        </div>
      </SectionCard>

      <SectionCard title="System">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormEntry
            label="Dataloader Threads"
            configPath="dataloader_threads"
            type="number"
            tooltip="Number of data loader threads"
          />
          <FormEntry
            label="Train Device"
            configPath="train_device"
            tooltip="Device to use for training (e.g. cuda)"
          />
          <FormEntry label="Temp Device" configPath="temp_device" tooltip="Device for temporary data (e.g. cpu)" />
        </div>
      </SectionCard>

      <SectionCard title="Multi-GPU">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Toggle configPath="multi_gpu" label="Multi GPU" tooltip="Enable multi-GPU training" />
          <FormEntry
            label="Device Indexes"
            configPath="device_indexes"
            tooltip="Comma-separated GPU device indexes"
          />
          <Select
            label="Gradient Reduce Precision"
            configPath="gradient_reduce_precision"
            options={[...GradientReducePrecisionValues]}
            tooltip="Precision for gradient reduction"
          />
          <Toggle configPath="fused_gradient_reduce" label="Fused Gradient Reduce" />
          <Toggle configPath="async_gradient_reduce" label="Async Gradient Reduce" />
          <FormEntry label="Async Buffer Size" configPath="async_gradient_reduce_buffer" type="number" />
        </div>
      </SectionCard>

      <SectionCard title="Debug">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Toggle configPath="debug_mode" label="Debug Mode" tooltip="Enable debug mode for additional logging" />
          <DirPicker label="Debug Directory" configPath="debug_dir" tooltip="Directory for debug output" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            className="theme-toggle gap-1.5 px-3 py-1.5"
            onClick={handleDebugPackage}
            disabled={debugLoading}
            title="Generate a zip file with config, system info, and logs for bug reports"
          >
            {debugLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            ) : (
              <><Bug className="w-4 h-4" /> Debug Package</>
            )}
          </button>
          {debugStatus && (
            <span className="text-xs text-[var(--color-on-surface-secondary)]">{debugStatus}</span>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
