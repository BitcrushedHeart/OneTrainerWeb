/**
 * REST client for tools endpoints (model conversion, dataset captioning,
 * dataset masking, etc.).
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
// Request / response types
// ---------------------------------------------------------------------------

export interface ConvertModelRequest {
  model_type: string;
  training_method: string;
  input_name: string;
  output_dtype: string;
  output_model_format: string;
  output_model_destination: string;
}

export interface ConvertModelResponse {
  ok: boolean;
  error: string | null;
}

export interface CaptionRequest {
  model?: string;
  folder: string;
  initial_caption?: string;
  caption_prefix?: string;
  caption_postfix?: string;
  mode?: string;
  include_subdirectories?: boolean;
}

export interface MaskRequest {
  model?: string;
  folder: string;
  prompt?: string;
  mode?: string;
  threshold?: number;
  smooth?: number;
  expand?: number;
  alpha?: number;
  include_subdirectories?: boolean;
}

export interface ToolActionResponse {
  ok: boolean;
  error: string | null;
  task_id: string | null;
}

export interface ToolStatusResponse {
  status: "idle" | "running" | "completed" | "error";
  progress: number;
  max_progress: number;
  error: string | null;
  task_id: string | null;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const toolsApi = {
  /** Convert a model between formats. Long-running synchronous call. */
  convertModel: (params: ConvertModelRequest) =>
    request<ConvertModelResponse>("/tools/convert", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  /** Start batch caption generation in the background. */
  generateCaptions: (params: CaptionRequest) =>
    request<ToolActionResponse>("/tools/captions/generate", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  /** Start batch mask generation in the background. */
  generateMasks: (params: MaskRequest) =>
    request<ToolActionResponse>("/tools/masks/generate", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  /** Get the current tool operation status and progress. */
  getStatus: () =>
    request<ToolStatusResponse>("/tools/status"),

  /** Cancel the current tool operation. */
  cancel: () =>
    request<ToolActionResponse>("/tools/cancel", { method: "POST" }),
};
