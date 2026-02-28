import { ModalBase } from "./ModalBase";
import { FormEntry, Toggle, Select, Button } from "@/components/shared";
import { TimestepDistributionValues } from "@/types/generated/enums";

export interface TimestepDistModalProps {
  open: boolean;
  onClose: () => void;
}

export function TimestepDistModal({ open, onClose }: TimestepDistModalProps) {
  return (
    <ModalBase open={open} onClose={onClose} title="Timestep Distribution" size="md">
      <div className="flex flex-col gap-4">
        <Select
          label="Timestep Distribution"
          configPath="timestep_distribution"
          options={[...TimestepDistributionValues]}
          tooltip="Selects the function to sample timesteps during training"
        />
        <FormEntry label="Min Noising Strength" configPath="min_noising_strength" type="number" tooltip="Minimum noising strength for timestep sampling" />
        <FormEntry label="Max Noising Strength" configPath="max_noising_strength" type="number" tooltip="Maximum noising strength for timestep sampling" />
        <FormEntry label="Noising Weight" configPath="noising_weight" type="number" tooltip="Weight for the noising distribution" />
        <FormEntry label="Noising Bias" configPath="noising_bias" type="number" tooltip="Bias for the noising distribution" />
        <FormEntry label="Timestep Shift" configPath="timestep_shift" type="number" tooltip="Shift applied to timestep values" />
        <Toggle configPath="dynamic_timestep_shifting" label="Dynamic Timestep Shifting" tooltip="Enable dynamic timestep shifting based on resolution" />
      </div>

      <div className="mt-6 p-4 rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)]">
        <p className="text-xs text-[var(--color-on-surface-secondary)]">
          Distribution visualization will be available when connected to the training backend.
        </p>
      </div>

      <div className="flex justify-end mt-6 pt-4 border-t border-[var(--color-border-subtle)]">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </ModalBase>
  );
}
