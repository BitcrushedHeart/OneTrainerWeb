import type { TrainConfig, ConceptConfig, SampleConfig, SecretsConfig } from "@/types/generated/config";

// In Vite dev mode, relative "/api" is proxied to the backend by Vite's
// dev server.  In Electron production mode the renderer loads from a
// file:// URL, so relative paths don't resolve to the backend.  We detect
// this and use the absolute backend URL instead.
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
// Response / payload types
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  version: string;
}

export interface PresetInfo {
  name: string;
  path: string;
  is_builtin: boolean;
}

export interface FieldMetadata {
  type: string;
  default: unknown;
  nullable: boolean;
  enum_values?: string[];
  min?: number;
  max?: number;
  description?: string;
}

export type ConfigSchema = Record<string, FieldMetadata>;

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const configApi = {
  // -- Health ---------------------------------------------------------------

  health: () => request<HealthResponse>("/health"),

  // -- Config CRUD ----------------------------------------------------------

  /** Fetch the full current config from the backend. */
  getConfig: () => request<TrainConfig>("/config"),

  /** PUT a full or partial config update. Returns the reconciled full config. */
  updateConfig: (config: TrainConfig) =>
    request<TrainConfig>("/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  /** Fetch the default config (factory defaults). */
  getDefaults: () => request<TrainConfig>("/config/defaults"),

  /** Fetch field metadata / validation schema. */
  getSchema: () =>
    request<{ fields: ConfigSchema }>("/config/schema").then((r) => r.fields),

  /** Export the current config as a downloadable JSON (includes inlined concepts/samples). */
  exportConfig: () =>
    request<TrainConfig>("/config/export", { method: "POST" }),

  // -- Presets --------------------------------------------------------------

  /** List all available presets (built-in and user). */
  listPresets: () => request<PresetInfo[]>("/presets"),

  /** Load a preset by path. Returns the full config from that preset. */
  loadPreset: (path: string) =>
    request<TrainConfig>("/presets/load", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  /** Save the current config as a named preset. */
  savePreset: (name: string) =>
    request<{ name: string; path: string }>("/presets/save", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  /** Delete a user preset by name. */
  deletePreset: (name: string) =>
    request<{ deleted: string }>(`/presets/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),

  // -- Concepts -------------------------------------------------------------

  /** Fetch the current concept list. */
  getConcepts: () => request<ConceptConfig[]>("/concepts"),

  /** Replace the concept list. */
  saveConcepts: (concepts: ConceptConfig[]) =>
    request<{ saved: number; path: string }>("/concepts", {
      method: "PUT",
      body: JSON.stringify(concepts),
    }),

  // -- Samples --------------------------------------------------------------

  /** Fetch the current sample definitions. */
  getSamples: () => request<SampleConfig[]>("/samples"),

  /** Replace the sample definitions. */
  saveSamples: (samples: SampleConfig[]) =>
    request<{ saved: number; path: string }>("/samples", {
      method: "PUT",
      body: JSON.stringify(samples),
    }),

  // -- Secrets --------------------------------------------------------------

  /** Fetch secrets (values will be masked by the backend). */
  getSecrets: () => request<SecretsConfig>("/secrets"),

  /** Save secrets. */
  saveSecrets: (secrets: SecretsConfig) =>
    request<SecretsConfig>("/secrets", {
      method: "PUT",
      body: JSON.stringify(secrets),
    }),

  // -- Tensorboard -----------------------------------------------------------

  /** List available training runs. */
  tensorboardRuns: () => request<string[]>("/tensorboard/runs"),

  /** List all scalar tags for a specific run. */
  tensorboardTags: (run: string) =>
    request<string[]>(`/tensorboard/scalars?run=${encodeURIComponent(run)}`),

  /** Fetch scalar data for a specific tag within a run. */
  tensorboardScalars: (run: string, tag: string, afterStep?: number) =>
    request<Array<{ wall_time: number; step: number; value: number }>>(
      `/tensorboard/scalars/${encodeURIComponent(tag)}?run=${encodeURIComponent(run)}${afterStep != null ? `&after_step=${afterStep}` : ""}`,
    ),

  /** Get the resolved tensorboard log directory config. */
  tensorboardConfig: () =>
    request<{ log_dir: string; exists: boolean }>("/tensorboard/config"),

  // -- Wiki -----------------------------------------------------------------

  /** Fetch the organized list of wiki page sections. */
  wikiPages: () =>
    request<Array<{ title: string; pages: string[] }>>("/wiki/pages"),

  /** Fetch the markdown content for a specific wiki page. */
  wikiPage: (slug: string) =>
    request<{ slug: string; content: string }>(`/wiki/pages/${encodeURIComponent(slug)}`),
};
