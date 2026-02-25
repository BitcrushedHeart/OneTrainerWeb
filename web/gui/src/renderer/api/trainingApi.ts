/**
 * REST client for training lifecycle endpoints.
 *
 * Follows the same pattern as configApi.ts — protocol-aware base URL
 * that works in both Vite dev mode and Electron production.
 */

const isFileProtocol =
  typeof window !== "undefined" && window.location.protocol === "file:";
const API_BASE = isFileProtocol ? "http://localhost:8000/api" : "/api";

// ---------------------------------------------------------------------------
// Generic request helper
// ---------------------------------------------------------------------------

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface TrainingActionResponse {
  ok: boolean;
  error: string | null;
}

export interface TrainingStatusResponse {
  status: "idle" | "running" | "stopping" | "error";
  error: string | null;
  start_time: number | null;
}

export interface CustomSampleRequest {
  prompt?: string;
  negative_prompt?: string;
  height?: number;
  width?: number;
  seed?: number;
  random_seed?: boolean;
  diffusion_steps?: number;
  cfg_scale?: number;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const trainingApi = {
  /** Start a training run using the current in-memory config. */
  start: (options?: { reattach?: boolean }) =>
    request<TrainingActionResponse>("/training/start", {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    }),

  /** Request a graceful training stop. */
  stop: () =>
    request<TrainingActionResponse>("/training/stop", { method: "POST" }),

  /** Request a default sample during training. */
  sample: () =>
    request<TrainingActionResponse>("/training/sample", { method: "POST" }),

  /** Request a custom sample with specified parameters. */
  sampleCustom: (params: CustomSampleRequest) =>
    request<TrainingActionResponse>("/training/sample/custom", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  /** Request an immediate backup during training. */
  backup: () =>
    request<TrainingActionResponse>("/training/backup", { method: "POST" }),

  /** Request an immediate save during training. */
  save: () =>
    request<TrainingActionResponse>("/training/save", { method: "POST" }),

  /** Get the current training status. */
  getStatus: () =>
    request<TrainingStatusResponse>("/training/status"),
};
