/**
 * Performance monitoring tab that displays real-time system metrics
 * (CPU, RAM, GPU VRAM, temperature, utilization) via WebSocket.
 *
 * Uses SVG charts following the same pattern as TensorboardPage.tsx
 * and a custom hook for WebSocket connectivity with reconnection.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { generateTicks, formatValue } from "@/utils/chartUtils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GpuMetrics {
  index: number;
  name: string;
  vram_used_mb: number;
  vram_total_mb: number;
  vram_percent: number;
  temperature: number | null;
  utilization: number | null;
}

interface MetricsSnapshot {
  cpu_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  ram_percent: number;
  gpus: GpuMetrics[];
}

interface TimestampedMetrics extends MetricsSnapshot {
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of data points in the rolling window (~5 minutes at 1s). */
const MAX_POINTS = 300;

/** WebSocket reconnection parameters. */
const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;
const BACKOFF_FACTOR = 2;

/** Chart dimensions (match TensorboardPage). */
const CHART_WIDTH = 520;
const CHART_HEIGHT = 260;
const CHART_PADDING = { top: 24, right: 16, bottom: 36, left: 64 };

/** Chart colors (brand palette). */
const LINE_COLOR = "var(--color-orchid-600)";
const GRID_COLOR = "var(--color-border-subtle)";
const TEXT_COLOR = "var(--color-on-surface-secondary)";
const AXIS_COLOR = "var(--color-on-surface-secondary)";

/** Per-GPU line colors that cycle. */
const GPU_COLORS = [
  "var(--color-orchid-600)",
  "var(--color-violet-500)",
  "var(--color-success-500)",
  "var(--color-warning-500)",
  "var(--color-info-500)",
  "var(--color-error-500)",
];

// Protocol-aware WebSocket URL (same pattern as useTrainingWebSocket)
const isFileProtocol =
  typeof window !== "undefined" && window.location.protocol === "file:";
const WS_BASE = isFileProtocol
  ? "ws://localhost:8000"
  : `ws://${window.location.host}`;
const WS_URL = `${WS_BASE}/ws/system`;

function formatTime(secondsAgo: number): string {
  if (secondsAgo < 60) return `${Math.round(secondsAgo)}s`;
  return `${Math.floor(secondsAgo / 60)}m${Math.round(secondsAgo % 60)}s`;
}

// ---------------------------------------------------------------------------
// useSystemWebSocket hook
// ---------------------------------------------------------------------------

interface UseSystemWebSocketResult {
  connected: boolean;
  latest: MetricsSnapshot | null;
  history: TimestampedMetrics[];
}

function useSystemWebSocket(): UseSystemWebSocketResult {
  const [connected, setConnected] = useState(false);
  const [latest, setLatest] = useState<MetricsSnapshot | null>(null);
  const [history, setHistory] = useState<TimestampedMetrics[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(INITIAL_RETRY_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "metrics" && msg.data) {
        const snapshot: MetricsSnapshot = msg.data;
        const timestamped: TimestampedMetrics = {
          ...snapshot,
          timestamp: Date.now() / 1000,
        };

        setLatest(snapshot);
        setHistory((prev) => {
          const next = [...prev, timestamped];
          if (next.length > MAX_POINTS) {
            return next.slice(next.length - MAX_POINTS);
          }
          return next;
        });
      }
    } catch {
      // Ignore unparseable messages
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryRef.current = INITIAL_RETRY_MS;
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        wsRef.current = null;
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function scheduleReconnect() {
      if (!mountedRef.current) return;

      retryTimerRef.current = setTimeout(() => {
        retryRef.current = Math.min(
          retryRef.current * BACKOFF_FACTOR,
          MAX_RETRY_MS,
        );
        connect();
      }, retryRef.current);
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [handleMessage]);

  return { connected, latest, history };
}

// ---------------------------------------------------------------------------
// MetricChart (SVG area/line chart — follows TensorboardPage ScalarChart)
// ---------------------------------------------------------------------------

interface ChartPoint {
  time: number;
  value: number;
}

interface MetricChartProps {
  title: string;
  points: ChartPoint[];
  unit: string;
  color?: string;
  /** If true, render as area chart with gradient fill. */
  area?: boolean;
  /** Fixed Y-axis max (e.g. 100 for percentages). */
  yMax?: number;
  /** Fixed Y-axis min (default 0). */
  yMin?: number;
}

function MetricChart({
  title,
  points,
  unit,
  color = LINE_COLOR,
  area = false,
  yMax: fixedYMax,
  yMin: fixedYMin,
}: MetricChartProps) {
  if (points.length === 0) {
    return (
      <div className="card card-static" style={{ padding: "16px" }}>
        <h4
          style={{
            margin: "0 0 8px 0",
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--color-on-surface)",
          }}
        >
          {title}
        </h4>
        <div
          style={{
            height: CHART_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-on-surface-secondary)",
            fontSize: "0.8125rem",
          }}
        >
          Waiting for data...
        </div>
      </div>
    );
  }

  // Compute data bounds
  const times = points.map((p) => p.time);
  const values = points.map((p) => p.value);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  const rawMinVal = Math.min(...values);
  const rawMaxVal = Math.max(...values);

  const yMin = fixedYMin !== undefined ? fixedYMin : Math.max(0, rawMinVal - (rawMaxVal - rawMinVal) * 0.05);
  const yMax = fixedYMax !== undefined ? fixedYMax : rawMaxVal + (rawMaxVal - rawMinVal) * 0.05 || 1;

  const timeRange = maxTime - minTime || 1;

  // Coordinate mapping
  const plotW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const xScale = (time: number) =>
    CHART_PADDING.left + ((time - minTime) / timeRange) * plotW;
  const yScale = (val: number) =>
    CHART_PADDING.top + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  // Build SVG path
  const pathParts = points.map((p, i) => {
    const x = xScale(p.time);
    const y = yScale(p.value);
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const linePath = pathParts.join(" ");

  // Build area fill path
  const areaPath =
    linePath +
    ` L${xScale(points[points.length - 1].time).toFixed(2)},${(CHART_PADDING.top + plotH).toFixed(2)}` +
    ` L${xScale(points[0].time).toFixed(2)},${(CHART_PADDING.top + plotH).toFixed(2)} Z`;

  // Generate ticks
  const xTicks = generateTicks(0, maxTime - minTime, 5);
  const yTicks = generateTicks(yMin, yMax, 5);

  // Latest value for display
  const latestValue = points[points.length - 1].value;

  // Unique gradient ID
  const gradId = `perf-area-${title.replace(/[^a-zA-Z0-9]/g, "-")}`;

  return (
    <div className="card card-static" style={{ padding: "16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "8px",
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
          {title}
        </h4>
        <span
          className="mono tabular-nums"
          style={{
            fontSize: "0.75rem",
            color: color,
            fontWeight: 600,
          }}
        >
          {formatValue(latestValue)} {unit}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        style={{ display: "block" }}
      >
        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <line
              key={`yg-${tick}`}
              x1={CHART_PADDING.left}
              y1={y}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y2={y}
              stroke={GRID_COLOR}
              strokeWidth="0.5"
              strokeDasharray="4,3"
            />
          );
        })}

        {/* Area fill with gradient */}
        {area && (
          <>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradId})`} />
          </>
        )}

        {/* Data line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* X-axis labels (time ago) */}
        {xTicks.map((tick) => {
          const x = xScale(minTime + tick);
          if (x < CHART_PADDING.left || x > CHART_WIDTH - CHART_PADDING.right) return null;
          return (
            <text
              key={`xl-${tick}`}
              x={x}
              y={CHART_HEIGHT - 6}
              textAnchor="middle"
              fill={TEXT_COLOR}
              fontSize="9"
              fontFamily="var(--font-mono)"
            >
              {formatTime(tick)}
            </text>
          );
        })}

        {/* Y-axis labels */}
        {yTicks.map((tick) => {
          const y = yScale(tick);
          if (y < CHART_PADDING.top || y > CHART_PADDING.top + plotH) return null;
          return (
            <text
              key={`yl-${tick}`}
              x={CHART_PADDING.left - 6}
              y={y + 3}
              textAnchor="end"
              fill={TEXT_COLOR}
              fontSize="9"
              fontFamily="var(--font-mono)"
            >
              {formatValue(tick)}
            </text>
          );
        })}

        {/* X-axis label */}
        <text
          x={CHART_PADDING.left + plotW / 2}
          y={CHART_HEIGHT - 0}
          textAnchor="middle"
          fill={AXIS_COLOR}
          fontSize="9"
          fontFamily="var(--font-sans)"
        >
          time
        </text>

        {/* Axes */}
        <line
          x1={CHART_PADDING.left}
          y1={CHART_PADDING.top}
          x2={CHART_PADDING.left}
          y2={CHART_PADDING.top + plotH}
          stroke={AXIS_COLOR}
          strokeWidth="0.5"
          opacity="0.5"
        />
        <line
          x1={CHART_PADDING.left}
          y1={CHART_PADDING.top + plotH}
          x2={CHART_WIDTH - CHART_PADDING.right}
          y2={CHART_PADDING.top + plotH}
          stroke={AXIS_COLOR}
          strokeWidth="0.5"
          opacity="0.5"
        />

        {/* Data point count */}
        <text
          x={CHART_WIDTH - CHART_PADDING.right}
          y={CHART_PADDING.top - 8}
          textAnchor="end"
          fill={TEXT_COLOR}
          fontSize="8"
          fontFamily="var(--font-mono)"
          opacity="0.6"
        >
          {points.length} pts
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard (summary metric display)
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  color?: string;
}

function StatCard({ label, value, subtext, color }: StatCardProps) {
  return (
    <div
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-sm)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <span
        style={{
          fontSize: "0.6875rem",
          fontWeight: 500,
          color: "var(--color-on-surface-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      <span
        className="mono tabular-nums"
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: color ?? "var(--color-on-surface)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
      {subtext && (
        <span
          className="mono tabular-nums"
          style={{
            fontSize: "0.6875rem",
            color: "var(--color-on-surface-secondary)",
          }}
        >
          {subtext}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: extract chart data from history
// ---------------------------------------------------------------------------

function extractTimeSeries(
  history: TimestampedMetrics[],
  accessor: (m: TimestampedMetrics) => number | null | undefined,
): ChartPoint[] {
  if (history.length === 0) return [];

  const startTime = history[0].timestamp;
  const points: ChartPoint[] = [];

  for (const m of history) {
    const val = accessor(m);
    if (val !== null && val !== undefined) {
      points.push({ time: m.timestamp - startTime, value: val });
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// PerformancePage
// ---------------------------------------------------------------------------

export default function PerformancePage() {
  const { connected, latest, history } = useSystemWebSocket();

  // Build chart data from history
  const cpuPoints = extractTimeSeries(history, (m) => m.cpu_percent);
  const ramPoints = extractTimeSeries(history, (m) => m.ram_used_gb);

  // Detect GPU count from latest metrics
  const gpuCount = latest?.gpus.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Connection status */}
      <div className="card card-static" style={{ padding: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--color-on-surface)",
            }}
          >
            System Monitor
          </span>

          <span
            style={{
              fontSize: "0.6875rem",
              color: connected
                ? "var(--color-success-500)"
                : "var(--color-on-surface-secondary)",
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
                background: connected
                  ? "var(--color-success-500)"
                  : "var(--color-on-surface-secondary)",
                display: "inline-block",
                animation: connected ? "pulseError 2s infinite" : "none",
              }}
            />
            {connected ? "Live (1s interval)" : "Connecting..."}
          </span>

          {history.length > 0 && (
            <span
              className="mono tabular-nums"
              style={{
                fontSize: "0.6875rem",
                color: "var(--color-on-surface-secondary)",
                marginLeft: "auto",
              }}
            >
              {history.length}/{MAX_POINTS} samples
            </span>
          )}
        </div>
      </div>

      {/* Current stats cards */}
      {latest && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          <StatCard
            label="CPU"
            value={`${latest.cpu_percent.toFixed(1)}%`}
            color={
              latest.cpu_percent > 90
                ? "var(--color-error-500)"
                : latest.cpu_percent > 70
                  ? "var(--color-warning-500)"
                  : "var(--color-success-500)"
            }
          />
          <StatCard
            label="RAM"
            value={`${latest.ram_used_gb.toFixed(1)} GB`}
            subtext={`/ ${latest.ram_total_gb.toFixed(1)} GB (${latest.ram_percent.toFixed(0)}%)`}
            color={
              latest.ram_percent > 90
                ? "var(--color-error-500)"
                : latest.ram_percent > 70
                  ? "var(--color-warning-500)"
                  : "var(--color-on-surface)"
            }
          />
          {latest.gpus.map((gpu) => (
            <StatCard
              key={gpu.index}
              label={`GPU ${gpu.index} VRAM`}
              value={`${(gpu.vram_used_mb / 1024).toFixed(1)} GB`}
              subtext={`/ ${(gpu.vram_total_mb / 1024).toFixed(1)} GB (${gpu.vram_percent.toFixed(0)}%) - ${gpu.name}`}
              color={
                gpu.vram_percent > 90
                  ? "var(--color-error-500)"
                  : gpu.vram_percent > 70
                    ? "var(--color-warning-500)"
                    : "var(--color-orchid-600)"
              }
            />
          ))}
          {latest.gpus.map(
            (gpu) =>
              gpu.temperature !== null && (
                <StatCard
                  key={`temp-${gpu.index}`}
                  label={`GPU ${gpu.index} Temp`}
                  value={`${gpu.temperature.toFixed(0)}\u00B0C`}
                  color={
                    gpu.temperature > 85
                      ? "var(--color-error-500)"
                      : gpu.temperature > 70
                        ? "var(--color-warning-500)"
                        : "var(--color-success-500)"
                  }
                />
              ),
          )}
          {latest.gpus.map(
            (gpu) =>
              gpu.utilization !== null && (
                <StatCard
                  key={`util-${gpu.index}`}
                  label={`GPU ${gpu.index} Util`}
                  value={`${gpu.utilization.toFixed(0)}%`}
                  color={
                    gpu.utilization > 90
                      ? "var(--color-orchid-600)"
                      : "var(--color-on-surface)"
                  }
                />
              ),
          )}
        </div>
      )}

      {/* No GPU message */}
      {latest && gpuCount === 0 && (
        <div
          className="card card-static"
          style={{
            padding: "16px",
            textAlign: "center",
            color: "var(--color-on-surface-secondary)",
            fontSize: "0.875rem",
          }}
        >
          No GPU detected. GPU metrics are unavailable. CPU and RAM monitoring remain active.
        </div>
      )}

      {/* Charts grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 480px), 1fr))",
          gap: "16px",
        }}
      >
        {/* CPU chart */}
        <MetricChart
          title="CPU Usage"
          points={cpuPoints}
          unit="%"
          color="var(--color-info-500)"
          yMax={100}
          yMin={0}
        />

        {/* RAM chart */}
        <MetricChart
          title="RAM Usage"
          points={ramPoints}
          unit="GB"
          color="var(--color-violet-500)"
          area
          yMin={0}
          yMax={latest?.ram_total_gb}
        />

        {/* Per-GPU VRAM charts */}
        {Array.from({ length: gpuCount }).map((_, gpuIdx) => {
          const vramPoints = extractTimeSeries(
            history,
            (m) => m.gpus[gpuIdx]?.vram_used_mb ?? null,
          );
          const gpuName = latest?.gpus[gpuIdx]?.name ?? `GPU ${gpuIdx}`;
          const vramTotalMb = latest?.gpus[gpuIdx]?.vram_total_mb;
          return (
            <MetricChart
              key={`vram-${gpuIdx}`}
              title={`VRAM - ${gpuName}`}
              points={vramPoints}
              unit="MB"
              color={GPU_COLORS[gpuIdx % GPU_COLORS.length]}
              area
              yMin={0}
              yMax={vramTotalMb}
            />
          );
        })}

        {/* Per-GPU utilization charts */}
        {Array.from({ length: gpuCount }).map((_, gpuIdx) => {
          const hasUtil = latest?.gpus[gpuIdx]?.utilization !== null;
          if (!hasUtil) return null;
          const utilPoints = extractTimeSeries(
            history,
            (m) => m.gpus[gpuIdx]?.utilization ?? null,
          );
          const gpuName = latest?.gpus[gpuIdx]?.name ?? `GPU ${gpuIdx}`;
          return (
            <MetricChart
              key={`util-${gpuIdx}`}
              title={`GPU Utilization - ${gpuName}`}
              points={utilPoints}
              unit="%"
              color={GPU_COLORS[gpuIdx % GPU_COLORS.length]}
              yMax={100}
              yMin={0}
            />
          );
        })}

        {/* Per-GPU temperature charts */}
        {Array.from({ length: gpuCount }).map((_, gpuIdx) => {
          const hasTemp = latest?.gpus[gpuIdx]?.temperature !== null;
          if (!hasTemp) return null;
          const tempPoints = extractTimeSeries(
            history,
            (m) => m.gpus[gpuIdx]?.temperature ?? null,
          );
          const gpuName = latest?.gpus[gpuIdx]?.name ?? `GPU ${gpuIdx}`;
          return (
            <MetricChart
              key={`temp-${gpuIdx}`}
              title={`Temperature - ${gpuName}`}
              points={tempPoints}
              unit={"\u00B0C"}
              color="var(--color-error-500)"
              yMin={0}
              yMax={100}
            />
          );
        })}
      </div>

      {/* Waiting state before any data arrives */}
      {!latest && (
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
            Waiting for Metrics
          </h3>
          <p
            style={{
              margin: 0,
              color: "var(--color-on-surface-secondary)",
              fontSize: "0.875rem",
            }}
          >
            System metrics will appear here once the backend connection is established.
            The monitor streams CPU, RAM, and GPU data in real time.
          </p>
        </div>
      )}
    </div>
  );
}
