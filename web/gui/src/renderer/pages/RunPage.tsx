import { useCallback, useEffect, useRef, useState } from "react";
import { configApi } from "@/api/configApi";
import { useTrainingStore, type TrainingStatus } from "@/store/trainingStore";
import { ScalarChart } from "@/components/shared/ScalarChart";
import { ProgressBar } from "@/components/shared";
import { formatStep } from "@/utils/chartUtils";
import { formatDuration } from "@/utils/formatDuration";
import { useElapsedTime } from "@/hooks/useElapsedTime";

interface ScalarPoint {
  wall_time: number;
  step: number;
  value: number;
}

interface TagData {
  tag: string;
  points: ScalarPoint[];
  lastStep: number;
}

const ACTIVE_POLL_MS = 2000;
const PREPARING_POLL_MS = 4000;

const LINE_COLOR = "var(--color-orchid-600)";
const LR_LINE_COLOR = "var(--color-violet-500)";

function StatusBadge({ status }: { status: TrainingStatus }) {
  const colorMap: Record<TrainingStatus, { bg: string; fg: string; label: string }> = {
    idle: {
      bg: "var(--color-border-subtle)",
      fg: "var(--color-on-surface-secondary)",
      label: "Idle",
    },
    preparing: {
      bg: "var(--color-warning-500-alpha-12)",
      fg: "var(--color-warning-500)",
      label: "Preparing",
    },
    training: {
      bg: "var(--color-orchid-600-alpha-12)",
      fg: "var(--color-orchid-600)",
      label: "Training",
    },
    error: {
      bg: "var(--color-error-500-alpha-12)",
      fg: "var(--color-error-500)",
      label: "Error",
    },
  };

  const { bg, fg, label } = colorMap[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-label font-semibold tracking-wide uppercase"
      style={{ background: bg, color: fg }}
    >
      {(status === "training" || status === "preparing") && (
        <span
          className="w-1.5 h-1.5 rounded-full inline-block"
          style={{
            background: fg,
            animation: "pulseAlive 2s infinite",
          }}
        />
      )}
      {label}
    </span>
  );
}

export default function RunPage() {
  // Training store
  const status = useTrainingStore((s) => s.status);
  const progress = useTrainingStore((s) => s.progress);
  const statusText = useTrainingStore((s) => s.statusText);
  const latestSample = useTrainingStore((s) => s.latestSample);
  const sampleUrls = useTrainingStore((s) => s.sampleUrls);
  const error = useTrainingStore((s) => s.error);
  const startTime = useTrainingStore((s) => s.startTime);

  // TensorBoard data
  const [lossData, setLossData] = useState<TagData | null>(null);
  const [lrData, setLrData] = useState<TagData | null>(null);
  const [activeRun, setActiveRun] = useState<string>("");
  const [trainingCompleted, setTrainingCompleted] = useState(false);

  // Refs for polling interval access
  const lossDataRef = useRef<TagData | null>(null);
  const lrDataRef = useRef<TagData | null>(null);
  const activeRunRef = useRef<string>("");
  const statusRef = useRef<TrainingStatus>(status);

  lossDataRef.current = lossData;
  lrDataRef.current = lrData;
  activeRunRef.current = activeRun;
  statusRef.current = status;

  // Track training completion
  const prevStatusRef = useRef<TrainingStatus>(status);
  useEffect(() => {
    if (prevStatusRef.current === "training" && status === "idle") {
      setTrainingCompleted(true);
    } else if (status === "training" || status === "preparing") {
      setTrainingCompleted(false);
    }
    prevStatusRef.current = status;
  }, [status]);

  // Elapsed time tracking
  const elapsed = useElapsedTime(startTime, status === "training");

  const detectLatestRun = useCallback(async () => {
    try {
      const runs = await configApi.tensorboardRuns();
      if (runs.length > 0) {
        // Pick the last run (most recent)
        const latest = runs[runs.length - 1];
        if (latest !== activeRunRef.current) {
          setActiveRun(latest);
          return latest;
        }
      }
    } catch {
      // Silently ignore — no TB data yet
    }
    return activeRunRef.current;
  }, []);

  const loadRunTags = useCallback(async (runName: string) => {
    if (!runName) return;
    try {
      const tags = await configApi.tensorboardTags(runName);

      // Find the loss and lr tags
      const lossTag = tags.find(
        (t) => t.toLowerCase() === "loss" || t.toLowerCase().includes("loss/train"),
      );
      const lrTag = tags.find(
        (t) =>
          t.toLowerCase() === "lr" ||
          t.toLowerCase() === "learning_rate" ||
          t.toLowerCase().includes("lr/"),
      );

      if (lossTag) {
        const points = await configApi.tensorboardScalars(runName, lossTag);
        const lastStep = points.length > 0 ? points[points.length - 1].step : 0;
        setLossData({ tag: lossTag, points, lastStep });
      } else {
        setLossData(null);
      }

      if (lrTag) {
        const points = await configApi.tensorboardScalars(runName, lrTag);
        const lastStep = points.length > 0 ? points[points.length - 1].step : 0;
        setLrData({ tag: lrTag, points, lastStep });
      } else {
        setLrData(null);
      }
    } catch {
      // Silently ignore fetch errors
    }
  }, []);

  const fetchIncremental = useCallback(async () => {
    const runName = activeRunRef.current;
    if (!runName) return;

    try {
      // If we have no data at all, try detecting a run and doing a full load
      if (!lossDataRef.current && !lrDataRef.current) {
        const detected = await detectLatestRun();
        if (detected) {
          await loadRunTags(detected);
        }
        return;
      }

      // Incremental fetch for loss
      if (lossDataRef.current) {
        const td = lossDataRef.current;
        const newPoints = await configApi.tensorboardScalars(
          runName,
          td.tag,
          td.lastStep,
        );
        if (newPoints.length > 0) {
          const allPoints = [...td.points, ...newPoints];
          setLossData({
            tag: td.tag,
            points: allPoints,
            lastStep: allPoints[allPoints.length - 1].step,
          });
        }
      }

      // Incremental fetch for lr
      if (lrDataRef.current) {
        const td = lrDataRef.current;
        const newPoints = await configApi.tensorboardScalars(
          runName,
          td.tag,
          td.lastStep,
        );
        if (newPoints.length > 0) {
          const allPoints = [...td.points, ...newPoints];
          setLrData({
            tag: td.tag,
            points: allPoints,
            lastStep: allPoints[allPoints.length - 1].step,
          });
        }
      }
    } catch {
      // Silently ignore incremental fetch errors
    }
  }, [detectLatestRun, loadRunTags]);

  useEffect(() => {
    if (status === "training" || status === "preparing") {
      detectLatestRun().then((run) => {
        if (run) {
          loadRunTags(run);
        }
      });
    }
  }, [status, detectLatestRun, loadRunTags]);

  useEffect(() => {
    if (status !== "training" && status !== "preparing") return;

    const intervalMs = status === "training" ? ACTIVE_POLL_MS : PREPARING_POLL_MS;
    const interval = setInterval(fetchIncremental, intervalMs);
    return () => clearInterval(interval);
  }, [status, fetchIncremental]);

  if (status === "idle" && !trainingCompleted) {
    return (
      <div className="flex flex-col gap-6">
        <div className="card card-static px-8 py-12 text-center">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-on-surface-secondary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-4 block opacity-50"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="10,8 16,12 10,16" fill="var(--color-on-surface-secondary)" stroke="none" />
          </svg>
          <h3 className="m-0 mb-2 text-[var(--color-on-surface)] text-body font-semibold">
            No Active Training Run
          </h3>
          <p className="m-0 mx-auto text-[var(--color-on-surface-secondary)] text-small leading-relaxed max-w-[420px]">
            Start a training run to see live metrics here. For historical data,
            visit the TensorBoard tab.
          </p>
        </div>
      </div>
    );
  }

  const isActive = status === "training" || status === "preparing";
  const hasChartData = (lossData && lossData.points.length > 0) || (lrData && lrData.points.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div
        className="card card-static px-5 py-4"
        style={{
          borderColor: isActive
            ? "var(--color-orchid-600-alpha-20)"
            : trainingCompleted
              ? "var(--color-success-500-alpha-20)"
              : undefined,
          background: isActive
            ? "linear-gradient(135deg, var(--color-orchid-600-alpha-04), var(--color-violet-500-alpha-04))"
            : undefined,
        }}
      >
        <div className="flex items-center gap-4 flex-wrap">
          <StatusBadge status={status} />

          {progress && (
            <>
              <div className="flex-1 min-w-[120px]">
                <ProgressBar value={progress.maxStep > 0 ? (progress.step / progress.maxStep) * 100 : 0} />
              </div>

              <div className="mono tabular-nums flex items-center gap-4 text-micro text-[var(--color-on-surface-secondary)] whitespace-nowrap">
                <span>
                  Step{" "}
                  <span className="text-[var(--color-on-surface)] font-semibold">
                    {formatStep(progress.step)}
                  </span>
                  /{formatStep(progress.maxStep)}
                </span>
                <span>
                  Epoch{" "}
                  <span className="text-[var(--color-on-surface)] font-semibold">
                    {progress.epoch}
                  </span>
                  /{progress.maxEpoch}
                </span>
                {startTime && status === "training" && elapsed > 0 && (
                  <span>{formatDuration(elapsed)}</span>
                )}
              </div>
            </>
          )}

          {statusText && !progress && (
            <span className="text-caption text-[var(--color-on-surface-secondary)]">
              {statusText}
            </span>
          )}

          {isActive && (
            <span className="text-label text-[var(--color-success-500)] inline-flex items-center gap-1 ml-auto">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block bg-[var(--color-success-500)]"
                style={{ animation: "pulseAlive 2s infinite" }}
              />
              Live
            </span>
          )}
        </div>

        {trainingCompleted && (
          <div className="mt-3 px-3 py-2 rounded-md flex items-center gap-2 text-caption font-medium text-[var(--color-success-500)]"
            style={{
              background: "var(--color-success-500-alpha-08)",
              border: "1px solid var(--color-success-500-alpha-15)",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20,6 9,17 4,12" />
            </svg>
            Training completed. Results shown below.
          </div>
        )}

        {status === "error" && error && (
          <div
            className="mt-3 px-3 py-2 rounded-md text-caption font-medium text-[var(--color-error-500)]"
            style={{
              background: "var(--color-error-500-alpha-08)",
              border: "1px solid var(--color-error-500-alpha-15)",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {isActive && !hasChartData && (
        <div className="card card-static p-8 text-center flex flex-col items-center gap-3">
          <div className="skeleton w-[200px] h-2 rounded" />
          <span className="text-[var(--color-on-surface-secondary)] text-small">
            Waiting for training data...
          </span>
        </div>
      )}

      {(hasChartData || sampleUrls.length > 0) && (
        <div className="grid grid-cols-3 gap-4 items-start">
          <div className="col-span-2 flex flex-col gap-4">
            <ScalarChart
              tag="Loss"
              points={lossData?.points ?? []}
              lineColor={LINE_COLOR}
            />

            <ScalarChart
              tag="Learning Rate"
              points={lrData?.points ?? []}
              lineColor={LR_LINE_COLOR}
            />

            {activeRun && (
              <div className="text-label text-[var(--color-on-surface-secondary)] flex items-center gap-1.5 pl-1">
                <span className="opacity-60">Run:</span>
                <span className="mono font-medium">
                  {activeRun}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="card card-static p-4">
              <h4 className="m-0 mb-3 text-caption font-semibold text-[var(--color-on-surface)]">
                Latest Sample
              </h4>
              {latestSample ? (
                <div className="rounded-md overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)]">
                  <img
                    src={latestSample}
                    alt="Latest training sample"
                    className="block w-full max-h-[300px] object-contain"
                  />
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center rounded-md border border-dashed border-[var(--color-border-subtle)] text-[var(--color-on-surface-secondary)] text-caption">
                  No samples yet
                </div>
              )}
            </div>

            {sampleUrls.length > 1 && (
              <div className="card card-static p-4">
                <div className="flex justify-between items-baseline mb-3">
                  <h4 className="m-0 text-caption font-semibold text-[var(--color-on-surface)]">
                    Sample History
                  </h4>
                  <span className="mono tabular-nums text-label text-[var(--color-on-surface-secondary)]">
                    {sampleUrls.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
                  {[...sampleUrls]
                    .reverse()
                    .slice(1)
                    .map((url, idx) => (
                      <div
                        key={idx}
                        className="rounded overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)]"
                      >
                        <img
                          src={url}
                          alt="Training sample"
                          className="block w-full max-h-[180px] object-contain"
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
