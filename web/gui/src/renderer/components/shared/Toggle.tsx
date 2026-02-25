import { useConfigField } from "@/hooks/useConfigField";
import { Tooltip } from "./Tooltip";
import { getTooltip } from "@/utils/tooltips";

export interface ToggleProps {
  label?: string;
  labelPosition?: "left" | "right";
  configPath?: string;
  value?: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
  tooltip?: string;
}

export function Toggle({ label, labelPosition = "right", configPath, value, onChange, disabled, tooltip }: ToggleProps) {
  const resolvedTooltip = tooltip ?? (configPath ? getTooltip(configPath) : undefined);
  const [configValue, setConfigValue] = useConfigField<boolean>(configPath ?? "__unused__");
  const checked = configPath ? (configValue ?? false) : (value ?? false);
  const handleChange = () => {
    const next = !checked;
    if (configPath && setConfigValue) setConfigValue(next);
    if (onChange) onChange(next);
  };

  const switchEl = (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ease-out cursor-pointer
        disabled:opacity-40 disabled:cursor-not-allowed
        ${checked ? "bg-[var(--color-orchid-600)]" : "bg-[var(--color-border-subtle)]"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ease-out
          ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`}
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
      />
    </button>
  );

  const content = label ? (
    <label className="inline-flex items-center gap-3 cursor-pointer text-sm text-[var(--color-on-surface)]">
      {labelPosition === "left" && <span>{label}</span>}
      {switchEl}
      {labelPosition === "right" && <span>{label}</span>}
    </label>
  ) : switchEl;

  if (resolvedTooltip) return <Tooltip content={resolvedTooltip}>{content}</Tooltip>;
  return content;
}
