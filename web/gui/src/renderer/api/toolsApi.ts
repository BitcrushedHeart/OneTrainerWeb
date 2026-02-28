import { request, API_BASE } from "@/api/request";

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

export const toolsApi = {
  convertModel: (params: ConvertModelRequest) =>
    request<ConvertModelResponse>("/tools/convert", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  generateCaptions: (params: CaptionRequest) =>
    request<ToolActionResponse>("/tools/captions/generate", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  generateMasks: (params: MaskRequest) =>
    request<ToolActionResponse>("/tools/masks/generate", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  getStatus: () =>
    request<ToolStatusResponse>("/tools/status"),

  cancel: () =>
    request<ToolActionResponse>("/tools/cancel", { method: "POST" }),

  downloadDebugPackage: async (): Promise<string> => {
    const res = await fetch(`${API_BASE}/tools/debug-package`, {
      method: "POST",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to generate debug package: ${text}`);
    }

    // Extract filename from Content-Disposition header, or use a default
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch?.[1] ?? "OneTrainer_debug.zip";

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    return filename;
  },
};
