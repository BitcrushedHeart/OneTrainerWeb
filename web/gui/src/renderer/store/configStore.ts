import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { configApi } from "@/api/configApi";
import type { TrainConfig } from "@/types/generated/config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-notation path against an object and set the value.
 *
 * Example: `setByPath(obj, "optimizer.learning_rate", 1e-4)` sets
 * `obj.optimizer.learning_rate = 1e-4`.
 *
 * Works on Immer draft objects so mutations are safe.
 */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || current[key] === null) {
      // Automatically create intermediate objects when a segment is missing.
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

/**
 * Retrieve a value at a dot-notation path. Returns `undefined` if any
 * intermediate segment is missing.
 */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;

  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

// ---------------------------------------------------------------------------
// Debounce timer management
// ---------------------------------------------------------------------------

let syncTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 500;

/** Generation counter for stale-response protection in syncToBackend. */
let syncGeneration = 0;

function cancelPendingSync(): void {
  if (syncTimer !== null) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface ConfigState {
  /** The current working config. `null` until first load completes. */
  config: TrainConfig | null;

  /** True when local state has unsaved changes not yet synced to the backend. */
  isDirty: boolean;

  /** True while an async operation (load, sync, preset, etc.) is in progress. */
  isLoading: boolean;

  /** Human-readable error message from the last failed operation, or `null`. */
  error: string | null;

  // -- Actions --------------------------------------------------------------

  /** Fetch the current config from the backend and replace local state. */
  loadConfig: () => Promise<void>;

  /**
   * Update a single field by dot-notation path.
   *
   * Marks the store dirty and schedules a debounced sync to the backend.
   * The sync batches all field changes that arrive within 500 ms.
   */
  updateField: (path: string, value: unknown) => void;

  /** Merge a partial config object into local state (shallow at top level). */
  updateConfig: (partial: Partial<TrainConfig>) => void;

  /**
   * Immediately PUT the full local config to the backend.
   *
   * The backend response replaces local state entirely, ensuring
   * reconciliation of any server-side defaults or validations.
   */
  syncToBackend: () => Promise<void>;

  /** Load a preset by path. Replaces the local config with the preset. */
  loadPreset: (presetPath: string) => Promise<void>;

  /** Save the current config as a named preset. */
  savePreset: (name: string) => Promise<void>;

  /**
   * Change the optimizer and reload server-computed defaults.
   *
   * Updates `config.optimizer.optimizer`, syncs to backend, and the returned
   * config will contain the backend-populated optimizer defaults for the
   * selected optimizer.
   */
  changeOptimizer: (optimizer: string) => Promise<void>;

  /** Replace local config with factory defaults from the backend. */
  loadDefaults: () => Promise<void>;

  /** Export the current config as a JSON object (includes inlined concepts/samples). */
  exportConfig: () => Promise<TrainConfig>;

  /** Clear the current error. */
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useConfigStore = create<ConfigState>()(
  immer((set, get) => ({
    config: null,
    isDirty: false,
    isLoading: false,
    error: null,

    // -- loadConfig ---------------------------------------------------------

    loadConfig: async () => {
      set((draft) => {
        draft.isLoading = true;
        draft.error = null;
      });

      try {
        const config = await configApi.getConfig();
        cancelPendingSync();
        set((draft) => {
          draft.config = config;
          draft.isDirty = false;
          draft.isLoading = false;
        });
      } catch (err) {
        set((draft) => {
          draft.error = err instanceof Error ? err.message : String(err);
          draft.isLoading = false;
        });
      }
    },

    // -- updateField --------------------------------------------------------

    updateField: (path: string, value: unknown) => {
      set((draft) => {
        if (draft.config === null) return;
        setByPath(draft.config as unknown as Record<string, unknown>, path, value);
        draft.isDirty = true;
        draft.error = null;
      });

      // Schedule a debounced sync to the backend.
      cancelPendingSync();
      syncTimer = setTimeout(() => {
        syncTimer = null;
        void get().syncToBackend();
      }, SYNC_DEBOUNCE_MS);
    },

    // -- updateConfig -------------------------------------------------------

    updateConfig: (partial: Partial<TrainConfig>) => {
      set((draft) => {
        if (draft.config === null) return;
        Object.assign(draft.config, partial);
        draft.isDirty = true;
        draft.error = null;
      });

      cancelPendingSync();
      syncTimer = setTimeout(() => {
        syncTimer = null;
        void get().syncToBackend();
      }, SYNC_DEBOUNCE_MS);
    },

    // -- syncToBackend ------------------------------------------------------

    syncToBackend: async () => {
      const { config, isDirty } = get();
      if (config === null || !isDirty) return;

      cancelPendingSync();

      set((draft) => {
        draft.isLoading = true;
        draft.error = null;
      });

      const gen = ++syncGeneration;

      try {
        const reconciled = await configApi.updateConfig(config);
        // Only apply if no newer sync operation has started since this one.
        if (gen === syncGeneration) {
          set((draft) => {
            draft.config = reconciled;
            draft.isDirty = false;
            draft.isLoading = false;
          });
        }
      } catch (err) {
        if (gen === syncGeneration) {
          set((draft) => {
            draft.error = err instanceof Error ? err.message : String(err);
            draft.isLoading = false;
          });
        }
      }
    },

    // -- loadPreset ---------------------------------------------------------

    loadPreset: async (presetPath: string) => {
      cancelPendingSync();

      set((draft) => {
        draft.isLoading = true;
        draft.error = null;
      });

      try {
        const config = await configApi.loadPreset(presetPath);
        set((draft) => {
          draft.config = config;
          draft.isDirty = false;
          draft.isLoading = false;
        });
      } catch (err) {
        set((draft) => {
          draft.error = err instanceof Error ? err.message : String(err);
          draft.isLoading = false;
        });
      }
    },

    // -- savePreset ---------------------------------------------------------

    savePreset: async (name: string) => {
      // Flush any pending field changes before saving.
      const { isDirty } = get();
      if (isDirty) {
        cancelPendingSync();
        await get().syncToBackend();
      }

      set((draft) => {
        draft.isLoading = true;
        draft.error = null;
      });

      try {
        await configApi.savePreset(name);
        set((draft) => {
          draft.isLoading = false;
        });
      } catch (err) {
        set((draft) => {
          draft.error = err instanceof Error ? err.message : String(err);
          draft.isLoading = false;
        });
      }
    },

    // -- changeOptimizer ----------------------------------------------------

    changeOptimizer: async (optimizer: string) => {
      cancelPendingSync();

      set((draft) => {
        if (draft.config === null) return;
        // Optimistically update the optimizer field so the UI reflects
        // the selection immediately.
        draft.config.optimizer.optimizer = optimizer as TrainConfig["optimizer"]["optimizer"];
        draft.isDirty = true;
        draft.error = null;
      });

      // Sync immediately -- the backend will populate optimizer defaults.
      await get().syncToBackend();
    },

    // -- loadDefaults -------------------------------------------------------

    loadDefaults: async () => {
      cancelPendingSync();

      set((draft) => {
        draft.isLoading = true;
        draft.error = null;
      });

      try {
        const defaults = await configApi.getDefaults();
        set((draft) => {
          draft.config = defaults;
          draft.isDirty = false;
          draft.isLoading = false;
        });
      } catch (err) {
        set((draft) => {
          draft.error = err instanceof Error ? err.message : String(err);
          draft.isLoading = false;
        });
      }
    },

    // -- exportConfig -------------------------------------------------------

    exportConfig: async () => {
      // Flush pending changes so the export is up to date.
      const { isDirty } = get();
      if (isDirty) {
        cancelPendingSync();
        await get().syncToBackend();
      }

      set((draft) => {
        draft.error = null;
      });

      try {
        return await configApi.exportConfig();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set((draft) => {
          draft.error = message;
        });
        throw err;
      }
    },

    // -- clearError ---------------------------------------------------------

    clearError: () => {
      set((draft) => {
        draft.error = null;
      });
    },
  })),
);
