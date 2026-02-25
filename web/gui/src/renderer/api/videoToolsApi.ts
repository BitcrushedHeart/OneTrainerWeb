/**
 * REST client for video tool endpoints (extract clips, extract images, download).
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
// Request / response types
// ---------------------------------------------------------------------------

export interface ExtractClipsParams {
  video_path?: string;
  directory?: string;
  batch_mode?: boolean;
  output_dir: string;
  time_start?: string;
  time_end?: string;
  output_subdirectories?: boolean;
  split_at_cuts?: boolean;
  max_length?: number;
  fps?: number;
  remove_borders?: boolean;
  crop_variation?: number;
}

export interface ExtractImagesParams {
  video_path?: string;
  directory?: string;
  batch_mode?: boolean;
  output_dir: string;
  time_start?: string;
  time_end?: string;
  output_subdirectories?: boolean;
  images_per_second?: number;
  blur_removal?: number;
  remove_borders?: boolean;
  crop_variation?: number;
}

export interface DownloadParams {
  url?: string;
  link_list_path?: string;
  batch_mode?: boolean;
  output_dir: string;
  additional_args?: string;
}

export interface VideoToolResponse {
  ok: boolean;
  error: string | null;
  message: string | null;
}

export interface VideoToolStatusResponse {
  status: "idle" | "running" | "completed" | "error";
  message: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const videoToolsApi = {
  /** Run clip extraction in a background thread. */
  extractClips: (params: ExtractClipsParams) =>
    request<VideoToolResponse>("/tools/video/extract-clips", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  /** Run image extraction in a background thread. */
  extractImages: (params: ExtractImagesParams) =>
    request<VideoToolResponse>("/tools/video/extract-images", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  /** Run yt-dlp download in a background thread. */
  download: (params: DownloadParams) =>
    request<VideoToolResponse>("/tools/video/download", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  /** Get the current video tool operation status. */
  getStatus: () =>
    request<VideoToolStatusResponse>("/tools/video/status"),
};
