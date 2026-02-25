export interface ProgressBarProps {
  value: number;
  label?: string;
  indeterminate?: boolean;
}

export function ProgressBar({ value, label, indeterminate }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-[var(--color-on-surface-secondary)]">{label}</span>}
      <div
        className="h-2 w-full rounded-full bg-[var(--color-border-subtle)] overflow-hidden"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Progress"}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${indeterminate ? "skeleton" : ""}`}
          style={{
            width: indeterminate ? "100%" : `${clamped}%`,
            background: indeterminate ? undefined : "linear-gradient(90deg, var(--color-orchid-600), var(--color-violet-500))",
          }}
        />
      </div>
      {!indeterminate && (
        <span className="text-xs text-[var(--color-on-surface-secondary)] tabular-nums">{clamped.toFixed(1)}%</span>
      )}
    </div>
  );
}
