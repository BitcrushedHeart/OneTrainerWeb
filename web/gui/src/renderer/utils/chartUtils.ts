/**
 * Shared chart utility functions for axis tick generation and value formatting.
 *
 * Used by TensorboardPage, RunPage, and PerformancePage.
 */

/**
 * Compute a "nice" step size for axis ticks given a data range and desired tick count.
 * Rounds to the nearest 1, 2, 5, or 10 multiple of the appropriate power of 10.
 */
export function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / mag;
  let nice: number;
  if (normalized <= 1.5) nice = 1;
  else if (normalized <= 3) nice = 2;
  else if (normalized <= 7) nice = 5;
  else nice = 10;
  return nice * mag;
}

/**
 * Generate an array of evenly-spaced "nice" tick values spanning [min, max].
 */
export function generateTicks(min: number, max: number, targetTicks: number): number[] {
  if (min === max) return [min];
  const step = niceStep(max - min, targetTicks);
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 0.01; t += step) {
    ticks.push(t);
  }
  return ticks;
}

/**
 * Format a numeric value for display on Y-axis labels and current-value readouts.
 * Handles millions, thousands, very small numbers, integers, and general precision.
 */
export function formatValue(v: number): string {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "k";
  if (Math.abs(v) < 0.001 && v !== 0) return v.toExponential(1);
  if (Number.isInteger(v)) return v.toString();
  return v.toPrecision(4);
}

/**
 * Format a step number for display on X-axis labels. Abbreviates thousands and millions.
 */
export function formatStep(s: number): string {
  if (s >= 1e6) return (s / 1e6).toFixed(1) + "M";
  if (s >= 1e3) return (s / 1e3).toFixed(1) + "k";
  return s.toString();
}
