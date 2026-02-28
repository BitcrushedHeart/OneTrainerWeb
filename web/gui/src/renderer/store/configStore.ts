import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { configApi } from "@/api/configApi";
import type { TrainConfig } from "@/types/generated/config";

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

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

let syncTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 500;

// stale-response guard
let syncGeneration = 0;

function cancelPendingSync(): void {
  if (syncTimer !== null) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

function scheduleDebouncedSync(get: () => ConfigState): void {
  cancelPendingSync();
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void get().syncToBackend();
  }, SYNC_DEBOUNCE_MS);
}

type ImmerSet = (fn: (draft: ConfigState) => void) => void;

async function withLoading(set: ImmerSet, fn: () => Promise<void>): Promise<void> {
  set((draft) => { draft.isLoading = true; draft.error = null; });
  try {
    await fn();
  } catch (err) {
    set((draft) => {
      draft.error = err instanceof Error ? err.message : String(err);
      draft.isLoading = false;
    });
  }
}

interface ConfigState {
  config: TrainConfig | null;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;
  loadedPresetName: string | null;

  loadConfig: () => Promise<void>;
  updateField: (path: string, value: unknown) => void;
  updateConfig: (partial: Partial<TrainConfig>) => void;
  syncToBackend: () => Promise<void>;
  loadPreset: (presetPath: string, presetName?: string) => Promise<void>;
  savePreset: (name: string) => Promise<void>;
  autoLoadPreset: () => Promise<void>;
  changeOptimizer: (optimizer: string) => Promise<void>;
  loadDefaults: () => Promise<void>;
  exportConfig: () => Promise<TrainConfig>;
  clearError: () => void;
}

export const useConfigStore = create<ConfigState>()(
  immer((set, get) => ({
    config: null,
    isDirty: false,
    isLoading: false,
    error: null,
    loadedPresetName: null,

    loadConfig: async () => {
      await withLoading(set, async () => {
        const config = await configApi.getConfig();
        cancelPendingSync();
        set((draft) => {
          draft.config = config;
          draft.isDirty = false;
          draft.isLoading = false;
        });
      });
    },

    updateField: (path: string, value: unknown) => {
      set((draft) => {
        if (draft.config === null) return;
        setByPath(draft.config as unknown as Record<string, unknown>, path, value);
        draft.isDirty = true;
        draft.error = null;
      });
      scheduleDebouncedSync(get);
    },

    updateConfig: (partial: Partial<TrainConfig>) => {
      set((draft) => {
        if (draft.config === null) return;
        Object.assign(draft.config, partial);
        draft.isDirty = true;
        draft.error = null;
      });
      scheduleDebouncedSync(get);
    },

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

    loadPreset: async (presetPath: string, presetName?: string) => {
      cancelPendingSync();
      ++syncGeneration;

      await withLoading(set, async () => {
        const config = await configApi.loadPreset(presetPath);
        const name = presetName ?? presetPath.replace(/.*[/\\]/, "").replace(/\.json$/, "");
        set((draft) => {
          draft.config = config;
          draft.isDirty = false;
          draft.isLoading = false;
          draft.loadedPresetName = name;
        });
        try { localStorage.setItem("onetrainer_last_preset", presetPath); } catch { /* ignore */ }
      });
    },

    savePreset: async (name: string) => {
      const { isDirty } = get();
      if (isDirty) {
        cancelPendingSync();
        await get().syncToBackend();
      }

      await withLoading(set, async () => {
        await configApi.savePreset(name);
        set((draft) => { draft.isLoading = false; });
      });
    },

    autoLoadPreset: async () => {
      try {
        const presets = await configApi.listPresets();
        if (presets.length === 0) return;

        const lastPath = localStorage.getItem("onetrainer_last_preset");
        if (lastPath) {
          const match = presets.find((p) => p.path === lastPath);
          if (match) {
            await get().loadPreset(match.path, match.name);
            return;
          }
        }

        const zImage = presets.find((p) => p.name.toLowerCase().includes("z-image") || p.name.toLowerCase().includes("z_image"));
        if (zImage) {
          await get().loadPreset(zImage.path, zImage.name);
          return;
        }

        const builtin = presets.find((p) => p.is_builtin);
        if (builtin) {
          await get().loadPreset(builtin.path, builtin.name);
        }
      } catch {
        // Auto-load is best-effort; don't fail startup
      }
    },

    changeOptimizer: async (optimizer: string) => {
      cancelPendingSync();
      ++syncGeneration;

      await withLoading(set, async () => {
        const config = await configApi.changeOptimizer(optimizer);
        set((draft) => {
          draft.config = config;
          draft.isDirty = false;
          draft.isLoading = false;
        });
      });
    },

    loadDefaults: async () => {
      cancelPendingSync();
      ++syncGeneration;

      await withLoading(set, async () => {
        const defaults = await configApi.getDefaults();
        set((draft) => {
          draft.config = defaults;
          draft.isDirty = false;
          draft.isLoading = false;
        });
      });
    },

    exportConfig: async () => {
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

    clearError: () => {
      set((draft) => {
        draft.error = null;
      });
    },
  })),
);
