import { useState, useMemo, useCallback } from "react";
import { SectionCard, SchemaField } from "@/components/shared";
import { useConfigField } from "@/hooks/useConfigField";
import { getTrainingSchema } from "@/schemas/trainingSchemas";
import type { FieldDef } from "@/schemas/fieldTypes";
import {
  OptimizerValues,
  LearningRateSchedulerValues,
  EMAModeValues,
  GradientCheckpointingMethodValues,
  LearningRateScalerValues,
  LossWeightValues,
  LossScalerValues,
  TimestepDistributionValues,
} from "@/types/generated/enums";
import type { ModelType } from "@/types/generated/enums";
import { OptimizerParamsModal } from "@/components/modals/OptimizerParamsModal";
import { SchedulerParamsModal } from "@/components/modals/SchedulerParamsModal";
import { TimestepDistModal } from "@/components/modals/TimestepDistModal";
import { OffloadingModal } from "@/components/modals/OffloadingModal";

// Fill in dynamic enum options
function resolveOptions(field: FieldDef): string[] {
  if (field.stringOptions && field.stringOptions.length > 0) return field.stringOptions;
  const optionMap: Record<string, string[]> = {
    "optimizer.optimizer": [...OptimizerValues],
    "learning_rate_scheduler": [...LearningRateSchedulerValues],
    "ema": [...EMAModeValues],
    "gradient_checkpointing": [...GradientCheckpointingMethodValues],
    "learning_rate_scaler": [...LearningRateScalerValues],
    "loss_weight_fn": [...LossWeightValues],
    "loss_scaler": [...LossScalerValues],
    "timestep_distribution": [...TimestepDistributionValues],
  };
  return optionMap[field.key] ?? [];
}

type ModalKey = "optimizer" | "scheduler" | "timestep" | "offloading" | null;

export default function TrainingPage() {
  const [modelType] = useConfigField<ModelType>("model_type");
  const schema = useMemo(() => getTrainingSchema(modelType ?? "STABLE_DIFFUSION_15"), [modelType]);
  const [activeModal, setActiveModal] = useState<ModalKey>(null);

  const handleAdvancedClick = useCallback((fieldKey: string) => {
    const modalMap: Record<string, ModalKey> = {
      "optimizer.optimizer": "optimizer",
      "learning_rate_scheduler": "scheduler",
      "timestep_distribution": "timestep",
      "gradient_checkpointing": "offloading",
    };
    const modal = modalMap[fieldKey];
    if (modal) setActiveModal(modal);
  }, []);

  const closeModal = useCallback(() => setActiveModal(null), []);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {schema.columns.map((column, colIdx) => (
          <div key={colIdx} className="flex flex-col gap-6">
            {column.sections.map((section) => (
              <SectionCard key={section.id} title={section.label}>
                <div className="flex flex-col gap-4">
                  {section.fields.map((field) => (
                    <SchemaField key={field.key} field={field} onAdvancedClick={handleAdvancedClick} resolveOptions={resolveOptions} />
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>
        ))}
      </div>

      <OptimizerParamsModal open={activeModal === "optimizer"} onClose={closeModal} />
      <SchedulerParamsModal open={activeModal === "scheduler"} onClose={closeModal} />
      <TimestepDistModal open={activeModal === "timestep"} onClose={closeModal} />
      <OffloadingModal open={activeModal === "offloading"} onClose={closeModal} />
    </>
  );
}
