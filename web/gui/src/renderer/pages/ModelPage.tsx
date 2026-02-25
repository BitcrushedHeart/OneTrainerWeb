import { SectionCard, SchemaField } from "@/components/shared";
import { useConfigField } from "@/hooks/useConfigField";
import { getModelSchema } from "@/schemas/modelSchemas";
import type { ModelType } from "@/types/generated/enums";
import { useMemo } from "react";

export default function ModelPage() {
  const [modelType] = useConfigField<ModelType>("model_type");
  const schema = useMemo(() => getModelSchema(modelType ?? "STABLE_DIFFUSION_15"), [modelType]);

  return (
    <div className="flex flex-col gap-6">
      {schema.sections.map((section) => (
        <SectionCard key={section.id} title={section.label}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.fields.map((field) => (
              <SchemaField key={field.key} field={field} />
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
