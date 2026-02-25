/**
 * REST client for standalone sampling endpoints.
 *
 * Follows the same pattern as trainingApi.ts — protocol-aware base URL
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

export interface SamplerActionResponse {
  ok: boolean;
  error: string | null;
}

export interface SampleData {
  file_type: "IMAGE" | "VIDEO" | "AUDIO" | string;
  format: string;
  data: string | null;
}

export interface SamplerSampleResponse {
  ok: boolean;
  error: string | null;
  sample: SampleData | null;
}

export interface SamplerStatusResponse {
  status: "idle" | "loading" | "ready" | "sampling" | "error";
  error: string | null;
  model_loaded: boolean;
  sample_progress: {
    step: number;
    max_step: number;
  };
}

export interface StandaloneSampleRequest {
  prompt?: string;
  negative_prompt?: string;
  height?: number;
  width?: number;
  seed?: number;
  random_seed?: boolean;
  diffusion_steps?: number;
  cfg_scale?: number;
  noise_scheduler?: string;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const samplingApi = {
  /** Load a model for standalone sampling based on the current config. */
  loadModel: () =>
    request<SamplerActionResponse>("/tools/sampling/load-model", { method: "POST" }),

  /** Generate a sample using the standalone loaded model. */
  sample: (params: StandaloneSampleRequest) =>
    request<SamplerSampleResponse>("/tools/sampling/sample", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  /** Unload the standalone sampling model and free GPU memory. */
  unload: () =>
    request<SamplerActionResponse>("/tools/sampling/unload", { method: "POST" }),

  /** Get the standalone sampling service status. */
  getStatus: () =>
    request<SamplerStatusResponse>("/tools/sampling/status"),
};
