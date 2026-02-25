import { useCallback, useEffect, useRef, useState } from "react";
import { configApi } from "@/api/configApi";
import { useTrainingStore, type TrainingStatus } from "@/store/trainingStore";
import { ScalarChart } from "@/components/shared/ScalarChart";
import { ProgressBar } from "@/components/shared";
import { formatStep } from "@/utils/chartUtils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Poll every 2s during active training (more aggressive than TensorboardPage). */
const ACTIVE_POLL_MS = 2000;
/** When preparing, poll a bit slower to avoid hammering before data exists. */
const PREPARING_POLL_MS = 4000;

const LINE_COLOR = "var(--color-orchid-600)";
const LR_LINE_COLOR = "var(--color-violet-500)";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: TrainingStatus }) {
  const colorMap: Record<TrainingStatus, { bg: string; fg: string; label: string }> = {
    idle: {
      bg: "var(--color-border-subtle)",
      fg: "var(--color-on-surface-secondary)",
      label: "Idle",
    },
    preparing: {
      bg: "rgba(251, 191, 36, 0.12)",
      fg: "var(--color-warning-500)",
      label: "Preparing",
    },
    training: {
      bg: "rgba(194, 24, 232, 0.12)",
      fg: "var(--color-orchid-600)",
      label: "Training",
    },
    error: {
      bg: "rgba(248, 113, 113, 0.12)",
      fg: "var(--color-error-500)",
      label: "Error",
    },
  };

  const { bg, fg, label } = colorMap[status];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 10px",
        borderRadius: "9999px",
        background: bg,
        color: fg,
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
      }}
    >
      {(status === "training" || status === "preparing") && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: fg,
            display: "inline-block",
            animation: "pulseError 2s infinite",
          }}
        />
      )}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// RunPage
// ---------------------------------------------------------------------------

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
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (status !== "training" || !startTime) {
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [status, startTime]);

  // ── Auto-detect latest run when training starts ─────────────────────────
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

  // ── Full load of tag data for a run ─────────────────────────────────────
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

  // ── Incremental fetch ──────────────────────────────────────────────────
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

  // ── On training start: detect run and load initial data ─────────────────
  useEffect(() => {
    if (status === "training" || status === "preparing") {
      detectLatestRun().then((run) => {
        if (run) {
          loadRunTags(run);
        }
      });
    }
  }, [status, detectLatestRun, loadRunTags]);

  // ── Polling loop (active during training/preparing) ────────────────────
  useEffect(() => {
    if (status !== "training" && status !== "preparing") return;

    const intervalMs = status === "training" ? ACTIVE_POLL_MS : PREPARING_POLL_MS;
    const interval = setInterval(fetchIncremental, intervalMs);
    return () => clearInterval(interval);
  }, [status, fetchIncremental]);

  // ── Render: Idle state ─────────────────────────────────────────────────
  if (status === "idle" && !trainingCompleted) {
    return (
      <div className="flex flex-col gap-6">
        <div
          className="card card-static"
          style={{
            padding: "48px 32px",
            textAlign: "center",
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-on-surface-secondary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: "0 auto 16px auto", display: "block", opacity: 0.5 }}
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="10,8 16,12 10,16" fill="var(--color-on-surface-secondary)" stroke="none" />
          </svg>
          <h3
            style={{
              margin: "0 0 8px 0",
              color: "var(--color-on-surface)",
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            No Active Training Run
          </h3>
          <p
            style={{
              margin: 0,
              color: "var(--color-on-surface-secondary)",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              maxWidth: "420px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Start a training run to see live metrics here. For historical data,
            visit the TensorBoard tab.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: Active / Completed state ───────────────────────────────────
  const isActive = status === "training" || status === "preparing";
  const hasChartData = (lossData && lossData.points.length > 0) || (lrData && lrData.points.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Status Bar ── */}
      <div
        className="card card-static"
        style={{
          padding: "16px 20px",
          borderColor: isActive
            ? "rgba(194, 24, 232, 0.2)"
            : trainingCompleted
              ? "rgba(45, 212, 191, 0.2)"
              : undefined,
          background: isActive
            ? "linear-gradient(135deg, rgba(194, 24, 232, 0.04), rgba(138, 77, 255, 0.04))"
            : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          {/* Status badge */}
          <StatusBadge status={status} />

          {/* Progress info */}
          {progress && (
            <>
              <div style={{ flex: 1, minWidth: "120px" }}>
                <ProgressBar value={progress.maxStep > 0 ? (progress.step / progress.maxStep) * 100 : 0} />
              </div>

              <div
                className="mono tabular-nums"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  fontSize: "0.75rem",
                  color: "var(--color-on-surface-secondary)",
                  whiteSpace: "nowrap",
                }}
              >
                <span>
                  Step{" "}
                  <span style={{ color: "var(--color-on-surface)", fontWeight: 600 }}>
                    {formatStep(progress.step)}
                  </span>
                  /{formatStep(progress.maxStep)}
                </span>
                <span>
                  Epoch{" "}
                  <span style={{ color: "var(--color-on-surface)", fontWeight: 600 }}>
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

          {/* Status text */}
          {statusText && !progress && (
            <span
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-on-surface-secondary)",
              }}
            >
              {statusText}
            </span>
          )}

          {/* Live indicator */}
          {isActive && (
            <span
              style={{
                fontSize: "0.6875rem",
                color: "var(--color-success-500)",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                marginLeft: "auto",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--color-success-500)",
                  display: "inline-block",
                  animation: "pulseError 2s infinite",
                }}
              />
              Live
            </span>
          )}
        </div>

        {/* Training completed banner */}
        {trainingCompleted && (
          <div
            style={{
              marginTop: "12px",
              padding: "8px 12px",
              borderRadius: "6px",
              background: "rgba(45, 212, 191, 0.08)",
              border: "1px solid rgba(45, 212, 191, 0.15)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.8125rem",
              color: "var(--color-success-500)",
              fontWeight: 500,
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

        {/* Error display */}
        {status === "error" && error && (
          <div
            style={{
              marginTop: "12px",
              padding: "8px 12px",
              borderRadius: "6px",
              background: "rgba(248, 113, 113, 0.08)",
              border: "1px solid rgba(248, 113, 113, 0.15)",
              fontSize: "0.8125rem",
              color: "var(--color-error-500)",
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* ── Waiting for data ── */}
      {isActive && !hasChartData && (
        <div
          className="card card-static"
          style={{
            padding: "32px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            className="skeleton"
            style={{
              width: "200px",
              height: "8px",
              borderRadius: "4px",
            }}
          />
          <span
            style={{
              color: "var(--color-on-surface-secondary)",
              fontSize: "0.875rem",
            }}
          >
            Waiting for training data...
          </span>
        </div>
      )}

      {/* ── Main content: Charts + Samples ── */}
      {(hasChartData || sampleUrls.length > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "16px",
            alignItems: "start",
          }}
        >
          {/* Left column: Charts (2/3 width) */}
          <div
            style={{
              gridColumn: "1 / 3",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {/* Loss chart */}
            <ScalarChart
              tag="Loss"
              points={lossData?.points ?? []}
              lineColor={LINE_COLOR}
            />

            {/* Learning rate chart */}
            <ScalarChart
              tag="Learning Rate"
              points={lrData?.points ?? []}
              lineColor={LR_LINE_COLOR}
            />

            {/* Active run info */}
            {activeRun && (
              <div
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--color-on-surface-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  paddingLeft: "4px",
                }}
              >
                <span style={{ opacity: 0.6 }}>Run:</span>
                <span className="mono" style={{ fontWeight: 500 }}>
                  {activeRun}
                </span>
              </div>
            )}
          </div>

          {/* Right column: Samples (1/3 width) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {/* Latest sample */}
            <div className="card card-static" style={{ padding: "16px" }}>
              <h4
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--color-on-surface)",
                }}
              >
                Latest Sample
              </h4>
              {latestSample ? (
                <div
                  style={{
                    borderRadius: "6px",
                    overflow: "hidden",
                    border: "1px solid var(--color-border-subtle)",
                    background: "var(--color-input-bg)",
                  }}
                >
                  <img
                    src={latestSample}
                    alt="Latest training sample"
                    style={{
                      display: "block",
                      width: "100%",
                      maxHeight: "300px",
                      objectFit: "contain",
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    height: "160px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "6px",
                    border: "1px dashed var(--color-border-subtle)",
                    color: "var(--color-on-surface-secondary)",
                    fontSize: "0.8125rem",
                  }}
                >
                  No samples yet
                </div>
              )}
            </div>

            {/* Sample gallery */}
            {sampleUrls.length > 1 && (
              <div className="card card-static" style={{ padding: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: "12px",
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "var(--color-on-surface)",
                    }}
                  >
                    Sample History
                  </h4>
                  <span
                    className="mono tabular-nums"
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--color-on-surface-secondary)",
                    }}
                  >
                    {sampleUrls.length}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    maxHeight: "400px",
                    overflowY: "auto",
                  }}
                >
                  {/* Show most recent first, excluding the latest (already shown above) */}
                  {[...sampleUrls]
                    .reverse()
                    .slice(1)
                    .map((url, idx) => (
                      <div
                        key={idx}
                        style={{
                          borderRadius: "4px",
                          overflow: "hidden",
                          border: "1px solid var(--color-border-subtle)",
                          background: "var(--color-input-bg)",
                        }}
                      >
                        <img
                          src={url}
                          alt={`Training sample ${sampleUrls.length - 1 - idx}`}
                          style={{
                            display: "block",
                            width: "100%",
                            maxHeight: "180px",
                            objectFit: "contain",
                          }}
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
