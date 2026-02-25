import { type ChangeEvent, forwardRef, useState, useEffect } from "react";
import { useConfigField } from "@/hooks/useConfigField";
import { FormFieldWrapper } from "./FormFieldWrapper";
import { INPUT_FULL, PLACEHOLDER } from "@/utils/inputStyles";

export interface FormEntryProps {
  label: string;
  configPath?: string;
  value?: string | number | null;
  onChange?: (value: string | number) => void;
  type?: "text" | "number";
  placeholder?: string;
  tooltip?: string;
  disabled?: boolean;
  nullable?: boolean;
  width?: string;
}

export const FormEntry = forwardRef<HTMLInputElement, FormEntryProps>(
  ({ label, configPath, value: controlledValue, onChange, type = "text", placeholder, tooltip, disabled, nullable, width }, ref) => {
    const [configValue, setConfigValue] = useConfigField<string | number | null>(configPath ?? "__unused__");

    const externalValue = configPath ? configValue : controlledValue;
    const [localValue, setLocalValue] = useState<string>(externalValue != null ? String(externalValue) : "");

    useEffect(() => {
      setLocalValue(externalValue != null ? String(externalValue) : "");
    }, [externalValue]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setLocalValue(raw);
      if (raw === "" && nullable) {
        if (configPath && setConfigValue) setConfigValue(null as unknown as string | number);
        return;
      }
      const parsed = type === "number" ? (raw === "" ? 0 : Number(raw)) : raw;
      if (type === "number" && isNaN(parsed as number)) return;
      if (configPath && setConfigValue) setConfigValue(parsed);
      if (onChange) onChange(parsed);
    };

    return (
      <FormFieldWrapper label={label} tooltip={tooltip} configPath={configPath} style={width ? { width } : undefined}>
        <input
          ref={ref}
          type={type}
          value={localValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`${INPUT_FULL} ${PLACEHOLDER}`}
        />
      </FormFieldWrapper>
    );
  },
);
FormEntry.displayName = "FormEntry";
