/**
 * Reusable SVG scalar chart component for step-based data.
 *
 * Used by TensorboardPage and RunPage. PerformancePage uses its own
 * time-series MetricChart that shares only the utility functions.
 */

import { generateTicks, formatValue, formatStep } from "@/utils/chartUtils";

// ---------------------------------------------------------------------------
// Constants (match the original inline values)
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 260;
const CHART_PADDING = { top: 24, right: 16, bottom: 36, left: 64 };

const DEFAULT_LINE_COLOR = "var(--color-orchid-600)";
const GRID_COLOR = "var(--color-border-subtle)";
const TEXT_COLOR = "var(--color-on-surface-secondary)";
const AXIS_COLOR = "var(--color-on-surface-secondary)";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScalarChartProps {
  tag: string;
  points: Array<{ step: number; value: number }>;
  lineColor?: string;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScalarChart({
  tag,
  points,
  lineColor = DEFAULT_LINE_COLOR,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: ScalarChartProps) {
  // Stable gradient ID derived from the tag
  const gradientId = `area-grad-${tag.replace(/[^a-zA-Z0-9]/g, "-")}`;

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
          {tag}
        </h4>
        <div
          style={{
            height: height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-on-surface-secondary)",
            fontSize: "0.8125rem",
          }}
        >
          No data yet
        </div>
      </div>
    );
  }

  // Compute data bounds
  const steps = points.map((p) => p.step);
  const values = points.map((p) => p.value);
  const minStep = Math.min(...steps);
  const maxStep = Math.max(...steps);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  // Add some padding to value range
  const valRange = maxVal - minVal || 1;
  const yMin = minVal - valRange * 0.05;
  const yMax = maxVal + valRange * 0.05;

  const stepRange = maxStep - minStep || 1;

  // Coordinate mapping
  const plotW = width - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = height - CHART_PADDING.top - CHART_PADDING.bottom;

  const xScale = (step: number) =>
    CHART_PADDING.left + ((step - minStep) / stepRange) * plotW;
  const yScale = (val: number) =>
    CHART_PADDING.top + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  // Build SVG path
  const pathParts = points.map((p, i) => {
    const x = xScale(p.step);
    const y = yScale(p.value);
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const linePath = pathParts.join(" ");

  // Build area fill path (line + close to bottom)
  const areaPath =
    linePath +
    ` L${xScale(points[points.length - 1].step).toFixed(2)},${(CHART_PADDING.top + plotH).toFixed(2)}` +
    ` L${xScale(points[0].step).toFixed(2)},${(CHART_PADDING.top + plotH).toFixed(2)} Z`;

  // Ticks
  const xTicks = generateTicks(minStep, maxStep, 5);
  const yTicks = generateTicks(yMin, yMax, 5);

  // Latest value for display
  const latest = points[points.length - 1];

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
          {tag}
        </h4>
        <span
          className="mono tabular-nums"
          style={{
            fontSize: "0.75rem",
            color: lineColor,
            fontWeight: 600,
          }}
        >
          {formatValue(latest.value)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
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
              x2={width - CHART_PADDING.right}
              y2={y}
              stroke={GRID_COLOR}
              strokeWidth="0.5"
              strokeDasharray="4,3"
            />
          );
        })}

        {/* Area fill with gradient */}
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Data line */}
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* X-axis labels */}
        {xTicks.map((tick) => {
          const x = xScale(tick);
          if (x < CHART_PADDING.left || x > width - CHART_PADDING.right) return null;
          return (
            <text
              key={`xl-${tick}`}
              x={x}
              y={height - 6}
              textAnchor="middle"
              fill={TEXT_COLOR}
              fontSize="9"
              fontFamily="var(--font-mono)"
            >
              {formatStep(tick)}
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
          y={height - 0}
          textAnchor="middle"
          fill={AXIS_COLOR}
          fontSize="9"
          fontFamily="var(--font-sans)"
        >
          step
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
          x2={width - CHART_PADDING.right}
          y2={CHART_PADDING.top + plotH}
          stroke={AXIS_COLOR}
          strokeWidth="0.5"
          opacity="0.5"
        />

        {/* Data point count */}
        <text
          x={width - CHART_PADDING.right}
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
