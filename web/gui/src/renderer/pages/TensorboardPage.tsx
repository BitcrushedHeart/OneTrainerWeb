import { useCallback, useEffect, useRef, useState } from "react";
import { configApi } from "@/api/configApi";
import { ScalarChart } from "@/components/shared/ScalarChart";

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

const POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// TensorboardPage
// ---------------------------------------------------------------------------

export default function TensorboardPage() {
  const [runs, setRuns] = useState<string[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>("");
  const [tagData, setTagData] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Ref to track the latest tag data for incremental fetches
  const tagDataRef = useRef<TagData[]>([]);
  tagDataRef.current = tagData;

  // Ref to track selected run in interval callback
  const selectedRunRef = useRef<string>("");
  selectedRunRef.current = selectedRun;

  // ── Fetch runs on mount ────────────────────────────────────────────────
  useEffect(() => {
    configApi
      .tensorboardRuns()
      .then((r) => {
        setRuns(r);
        if (r.length > 0 && !selectedRun) {
          setSelectedRun(r[0]);
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Full load when run changes ─────────────────────────────────────────
  const loadRunData = useCallback(
    async (runName: string) => {
      if (!runName) return;
      setLoading(true);
      setError(null);
      try {
        const tags = await configApi.tensorboardTags(runName);
        const dataPromises = tags.map(async (tag) => {
          const points = await configApi.tensorboardScalars(runName, tag);
          const lastStep = points.length > 0 ? points[points.length - 1].step : 0;
          return { tag, points, lastStep } as TagData;
        });
        const results = await Promise.all(dataPromises);
        setTagData(results);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedRun) {
      loadRunData(selectedRun);
    } else {
      setTagData([]);
    }
  }, [selectedRun, loadRunData]);

  // ── Incremental polling ────────────────────────────────────────────────
  const fetchIncremental = useCallback(async () => {
    const runName = selectedRunRef.current;
    if (!runName) return;

    const currentData = tagDataRef.current;
    if (currentData.length === 0) return;

    try {
      const updatedData = await Promise.all(
        currentData.map(async (td) => {
          const newPoints = await configApi.tensorboardScalars(
            runName,
            td.tag,
            td.lastStep,
          );
          if (newPoints.length === 0) return td;
          const allPoints = [...td.points, ...newPoints];
          return {
            tag: td.tag,
            points: allPoints,
            lastStep: allPoints[allPoints.length - 1].step,
          } as TagData;
        }),
      );
      setTagData(updatedData);
    } catch {
      // Silently ignore incremental fetch errors
    }
  }, []);

  useEffect(() => {
    if (!autoRefresh || !selectedRun) return;
    const interval = setInterval(fetchIncremental, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedRun, fetchIncremental]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="card card-static" style={{ padding: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          {/* Run selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label
              htmlFor="tb-run-select"
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--color-on-surface)",
                whiteSpace: "nowrap",
              }}
            >
              Training Run
            </label>
            <select
              id="tb-run-select"
              className="top-bar-select"
              value={selectedRun}
              onChange={(e) => setSelectedRun(e.target.value)}
              style={{ maxWidth: "400px", minWidth: "200px" }}
            >
              {runs.length === 0 && (
                <option value="">No runs available</option>
              )}
              {runs.map((run) => (
                <option key={run} value={run}>
                  {run}
                </option>
              ))}
            </select>
          </div>

          {/* Auto-refresh toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              className="theme-toggle"
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
              style={{
                padding: "5px 12px",
                fontSize: "0.75rem",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {autoRefresh ? (
                  <>
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </>
                ) : (
                  <polygon points="5,3 19,12 5,21" />
                )}
              </svg>
              {autoRefresh ? "Live" : "Paused"}
            </button>

            {/* Refresh button */}
            <button
              className="theme-toggle"
              onClick={() => loadRunData(selectedRun)}
              title="Refresh data"
              style={{
                padding: "5px 12px",
                fontSize: "0.75rem",
                fontWeight: 500,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23,4 23,10 17,10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>

          {/* Status indicator */}
          {autoRefresh && selectedRun && (
            <span
              style={{
                fontSize: "0.6875rem",
                color: "var(--color-success-500)",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
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
              Polling every {POLL_INTERVAL_MS / 1000}s
            </span>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div
          className="card card-static"
          style={{
            padding: "12px 16px",
            borderColor: "var(--color-error-500)",
            color: "var(--color-error-500)",
            fontSize: "0.8125rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div
          className="card card-static"
          style={{
            padding: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-on-surface-secondary)",
            fontSize: "0.875rem",
          }}
        >
          Loading tensorboard data...
        </div>
      )}

      {/* No data state */}
      {!loading && selectedRun && tagData.length === 0 && !error && (
        <div
          className="card card-static"
          style={{
            padding: "24px",
            textAlign: "center",
            color: "var(--color-on-surface-secondary)",
            fontSize: "0.875rem",
          }}
        >
          No scalar data found for this run. Training may not have started logging yet.
        </div>
      )}

      {/* No runs state */}
      {!loading && runs.length === 0 && !error && (
        <div
          className="card card-static"
          style={{
            padding: "32px",
            textAlign: "center",
          }}
        >
          <h3
            style={{
              margin: "0 0 8px 0",
              color: "var(--color-on-surface)",
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            No Training Runs Found
          </h3>
          <p
            style={{
              margin: 0,
              color: "var(--color-on-surface-secondary)",
              fontSize: "0.875rem",
            }}
          >
            TensorBoard event files will appear here once you start a training run.
            The log directory is derived from your workspace configuration.
          </p>
        </div>
      )}

      {/* Chart grid */}
      {!loading && tagData.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 480px), 1fr))",
            gap: "16px",
          }}
        >
          {tagData.map((td) => (
            <ScalarChart key={td.tag} tag={td.tag} points={td.points} />
          ))}
        </div>
      )}
    </div>
  );
}
