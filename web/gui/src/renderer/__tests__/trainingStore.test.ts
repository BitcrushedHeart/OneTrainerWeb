import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTrainingStore } from "@/store/trainingStore";
import { act } from "@testing-library/react";

vi.mock("@/api/trainingApi", () => ({
  trainingApi: {
    start: vi.fn(),
    stop: vi.fn(),
    sample: vi.fn(),
    backup: vi.fn(),
    save: vi.fn(),
    getStatus: vi.fn(),
  },
}));

import { trainingApi } from "@/api/trainingApi";
const mockedApi = vi.mocked(trainingApi);

describe("trainingStore", () => {
  beforeEach(() => {
    useTrainingStore.getState().reset();
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("starts as idle with no progress", () => {
      const state = useTrainingStore.getState();
      expect(state.status).toBe("idle");
      expect(state.progress).toBeNull();
      expect(state.error).toBeNull();
      expect(state.sampleUrls).toEqual([]);
    });
  });

  describe("setStatus", () => {
    it("updates training status", () => {
      act(() => useTrainingStore.getState().setStatus("training"));
      expect(useTrainingStore.getState().status).toBe("training");
    });
  });

  describe("addSampleUrl", () => {
    it("appends a sample URL", () => {
      act(() => useTrainingStore.getState().addSampleUrl("data:image/png;base64,abc"));

      const state = useTrainingStore.getState();
      expect(state.sampleUrls).toHaveLength(1);
      expect(state.latestSample).toBe("data:image/png;base64,abc");
    });

    it("caps at 50 samples", () => {
      act(() => {
        for (let i = 0; i < 55; i++) {
          useTrainingStore.getState().addSampleUrl(`url-${i}`);
        }
      });

      const state = useTrainingStore.getState();
      expect(state.sampleUrls).toHaveLength(50);
      expect(state.sampleUrls[0]).toBe("url-5");
      expect(state.sampleUrls[49]).toBe("url-54");
      expect(state.latestSample).toBe("url-54");
    });
  });

  describe("startTraining", () => {
    it("transitions to preparing and then respects API response", async () => {
      mockedApi.start.mockResolvedValue({ ok: true, error: null });

      await act(async () => {
        await useTrainingStore.getState().startTraining();
      });

      const state = useTrainingStore.getState();
      expect(state.startTime).not.toBeNull();
      expect(mockedApi.start).toHaveBeenCalled();
    });

    it("sets error state on failure", async () => {
      mockedApi.start.mockResolvedValue({ ok: false, error: "GPU out of memory" });

      await act(async () => {
        await useTrainingStore.getState().startTraining();
      });

      const state = useTrainingStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toBe("GPU out of memory");
    });

    it("prevents double-start when already training", async () => {
      useTrainingStore.setState({ status: "training" });

      await act(async () => {
        await useTrainingStore.getState().startTraining();
      });

      expect(mockedApi.start).not.toHaveBeenCalled();
    });
  });

  describe("fetchStatus", () => {
    it("sets training status from backend", async () => {
      mockedApi.getStatus.mockResolvedValue({ status: "running", error: null, start_time: null });

      await act(async () => {
        await useTrainingStore.getState().fetchStatus();
      });

      expect(useTrainingStore.getState().status).toBe("training");
    });

    it("handles error status", async () => {
      mockedApi.getStatus.mockResolvedValue({ status: "error", error: "CUDA OOM", start_time: null });

      await act(async () => {
        await useTrainingStore.getState().fetchStatus();
      });

      const state = useTrainingStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toBe("CUDA OOM");
    });

    it("gracefully handles backend unreachable", async () => {
      mockedApi.getStatus.mockRejectedValue(new Error("fetch failed"));

      await act(async () => {
        await useTrainingStore.getState().fetchStatus();
      });

      // Should not throw, status unchanged
      expect(useTrainingStore.getState().status).toBe("idle");
    });
  });

  describe("reset", () => {
    it("restores initial state", () => {
      useTrainingStore.setState({
        status: "training",
        error: "some error",
        sampleUrls: ["a", "b"],
      });

      act(() => useTrainingStore.getState().reset());

      const state = useTrainingStore.getState();
      expect(state.status).toBe("idle");
      expect(state.error).toBeNull();
      expect(state.sampleUrls).toEqual([]);
    });
  });
});
