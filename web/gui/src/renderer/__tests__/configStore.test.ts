import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConfigStore, getByPath } from "@/store/configStore";
import { act } from "@testing-library/react";

// Mock the configApi module
vi.mock("@/api/configApi", () => ({
  configApi: {
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
    getDefaults: vi.fn(),
    listPresets: vi.fn(),
    loadPreset: vi.fn(),
    savePreset: vi.fn(),
    changeOptimizer: vi.fn(),
    exportConfig: vi.fn(),
    health: vi.fn(),
  },
}));

// Import the mocked module
import { configApi } from "@/api/configApi";
const mockedApi = vi.mocked(configApi);

// Minimal TrainConfig stub for testing
const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  model_type: "STABLE_DIFFUSION_15",
  training_method: "FINE_TUNE",
  optimizer: { optimizer: "ADAMW", learning_rate: 1e-4 },
  ...overrides,
});

describe("configStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useConfigStore.setState({
      config: null,
      isDirty: false,
      isLoading: false,
      error: null,
      loadedPresetName: null,
    });
    vi.clearAllMocks();
  });

  describe("loadConfig", () => {
    it("fetches config from backend and updates store", async () => {
      const config = makeConfig();
      mockedApi.getConfig.mockResolvedValue(config as never);

      await act(async () => {
        await useConfigStore.getState().loadConfig();
      });

      const state = useConfigStore.getState();
      expect(state.config).toEqual(config);
      expect(state.isDirty).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("sets error on API failure", async () => {
      mockedApi.getConfig.mockRejectedValue(new Error("Network error"));

      await act(async () => {
        await useConfigStore.getState().loadConfig();
      });

      const state = useConfigStore.getState();
      expect(state.config).toBeNull();
      expect(state.error).toBe("Network error");
      expect(state.isLoading).toBe(false);
    });
  });

  describe("updateField", () => {
    it("updates a field by dot-notation path", () => {
      useConfigStore.setState({ config: makeConfig() as never });

      act(() => {
        useConfigStore.getState().updateField("optimizer.learning_rate", 1e-5);
      });

      const state = useConfigStore.getState();
      const config = state.config as unknown as { optimizer: { learning_rate: number } };
      expect(config.optimizer.learning_rate).toBe(1e-5);
      expect(state.isDirty).toBe(true);
    });

    it("does nothing if config is null", () => {
      act(() => {
        useConfigStore.getState().updateField("optimizer.learning_rate", 1e-5);
      });

      expect(useConfigStore.getState().config).toBeNull();
    });
  });

  describe("syncToBackend", () => {
    it("PUTs config to backend and applies reconciled response", async () => {
      const config = makeConfig();
      const reconciled = makeConfig({ optimizer: { optimizer: "ADAMW", learning_rate: 2e-4 } });
      useConfigStore.setState({ config: config as never, isDirty: true });
      mockedApi.updateConfig.mockResolvedValue(reconciled as never);

      await act(async () => {
        await useConfigStore.getState().syncToBackend();
      });

      const state = useConfigStore.getState();
      expect(state.config).toEqual(reconciled);
      expect(state.isDirty).toBe(false);
    });

    it("skips sync when not dirty", async () => {
      useConfigStore.setState({ config: makeConfig() as never, isDirty: false });

      await act(async () => {
        await useConfigStore.getState().syncToBackend();
      });

      expect(mockedApi.updateConfig).not.toHaveBeenCalled();
    });
  });

  describe("changeOptimizer", () => {
    it("calls backend and replaces config with response", async () => {
      const newConfig = makeConfig({ optimizer: { optimizer: "SGD", learning_rate: 0.01 } });
      useConfigStore.setState({ config: makeConfig() as never });
      mockedApi.changeOptimizer.mockResolvedValue(newConfig as never);

      await act(async () => {
        await useConfigStore.getState().changeOptimizer("SGD");
      });

      const state = useConfigStore.getState();
      expect(state.config).toEqual(newConfig);
      expect(state.isDirty).toBe(false);
    });
  });

  describe("getByPath", () => {
    it("resolves nested paths", () => {
      const obj = { a: { b: { c: 42 } } };
      expect(getByPath(obj, "a.b.c")).toBe(42);
    });

    it("returns undefined for missing paths", () => {
      const obj = { a: { b: 1 } };
      expect(getByPath(obj, "a.c.d")).toBeUndefined();
    });
  });
});
