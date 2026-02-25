import { ProgressBar } from "./ProgressBar";

export interface DualProgressProps {
  epochProgress: number;
  stepProgress: number;
  epochLabel?: string;
  stepLabel?: string;
}

export function DualProgress({ epochProgress, stepProgress, epochLabel = "Epoch", stepLabel = "Step" }: DualProgressProps) {
  return (
    <div className="flex flex-col gap-2 min-w-48">
      <ProgressBar value={epochProgress} label={epochLabel} />
      <ProgressBar value={stepProgress} label={stepLabel} />
    </div>
  );
}
