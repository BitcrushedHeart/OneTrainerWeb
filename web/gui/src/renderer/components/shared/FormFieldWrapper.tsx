import { type CSSProperties, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";
import { Info } from "lucide-react";
import { getTooltip } from "@/utils/tooltips";

export interface FormFieldWrapperProps {
  label?: string;
  tooltip?: string;
  configPath?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function FormFieldWrapper({ label, tooltip, configPath, className, style, children }: FormFieldWrapperProps) {
  const resolvedTooltip = tooltip ?? (configPath ? getTooltip(configPath) : undefined);

  return (
    <div className={className ?? "flex flex-col gap-1"} style={style}>
      {label && (
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-[var(--color-on-surface)]">{label}</span>
          {resolvedTooltip && (
            <Tooltip content={resolvedTooltip}>
              <Info className="w-3.5 h-3.5 text-[var(--color-on-surface-secondary)] cursor-help" />
            </Tooltip>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
