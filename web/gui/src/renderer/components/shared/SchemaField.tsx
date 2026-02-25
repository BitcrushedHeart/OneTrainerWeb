import type { FieldDef } from "@/schemas/fieldTypes";
import { FormEntry } from "./FormEntry";
import { FilePicker } from "./FilePicker";
import { DirPicker } from "./DirPicker";
import { Toggle } from "./Toggle";
import { Select } from "./Select";
import { SelectKV } from "./SelectKV";
import { SelectAdvanced } from "./SelectAdvanced";
import { TimeEntry } from "./TimeEntry";
import { LayerFilterEntry } from "./LayerFilterEntry";

export interface SchemaFieldProps {
  field: FieldDef;
  /** Called when a "select-adv" field's advanced button is clicked. */
  onAdvancedClick?: (fieldKey: string) => void;
  /** Resolve dynamic string options at render time (overrides field.stringOptions). */
  resolveOptions?: (field: FieldDef) => string[];
}

export function SchemaField({ field, onAdvancedClick, resolveOptions }: SchemaFieldProps) {
  const options = resolveOptions ? resolveOptions(field) : (field.stringOptions ?? []);

  switch (field.type) {
    case "entry":
      return <FormEntry label={field.label} configPath={field.key} type={field.inputType ?? "text"} tooltip={field.tooltip} nullable={field.nullable} />;
    case "file":
      return <FilePicker label={field.label} configPath={field.key} tooltip={field.tooltip} />;
    case "dir":
      return <DirPicker label={field.label} configPath={field.key} tooltip={field.tooltip} />;
    case "toggle":
      return <Toggle configPath={field.key} label={field.label} tooltip={field.tooltip} />;
    case "select":
      return <Select label={field.label} configPath={field.key} options={options} tooltip={field.tooltip} />;
    case "select-kv":
      return <SelectKV label={field.label} configPath={field.key} options={field.options ?? []} tooltip={field.tooltip} />;
    case "select-adv":
      return (
        <SelectAdvanced
          label={field.label}
          configPath={field.key}
          options={options}
          tooltip={field.tooltip}
          onAdvancedClick={() => onAdvancedClick?.(field.key)}
        />
      );
    case "time-entry":
      return <TimeEntry label={field.label} valuePath={field.valuePath ?? field.key} unitPath={field.unitPath ?? `${field.key}_unit`} tooltip={field.tooltip} />;
    case "layer-filter":
      return <LayerFilterEntry filterPath="layer_filter" presetPath="layer_filter_preset" regexPath="layer_filter_regex" />;
    default:
      return null;
  }
}
