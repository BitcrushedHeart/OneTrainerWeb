import { create } from "zustand";
import { trainingApi } from "@/api/trainingApi";

export type TrainingStatus = "idle" | "preparing" | "training" | "error";

export interface TrainingProgress {
  step: number;
  maxStep: number;
  epoch: number;
  maxEpoch: number;
  loss: number | null;
  learningRate: number | null;
  elapsedTime: number | null;
  remainingTime: number | null;
}

interface TrainingState {
  status: TrainingStatus;
  progress: TrainingProgress | null;
  error: string | null;
  statusText: string;
  sampleUrls: string[];
  latestSample: string | null;
  startTime: number | null;

  // Setters (called by WebSocket hook)
  setStatus: (status: TrainingStatus) => void;
  setProgress: (progress: TrainingProgress) => void;
  setError: (error: string | null) => void;
  setStatusText: (text: string) => void;
  addSampleUrl: (url: string) => void;
  clearSamples: () => void;
  reset: () => void;

  // State recovery
  fetchStatus: () => Promise<void>;

  // Training control actions (call REST API)
  startTraining: (options?: { reattach?: boolean }) => Promise<void>;
  stopTraining: () => Promise<void>;
  sampleNow: () => Promise<void>;
  backupNow: () => Promise<void>;
  saveNow: () => Promise<void>;
}

const INITIAL_STATE = {
  status: "idle" as TrainingStatus,
  progress: null as TrainingProgress | null,
  error: null as string | null,
  statusText: "",
  sampleUrls: [] as string[],
  latestSample: null as string | null,
  startTime: null as number | null,
};

export const useTrainingStore = create<TrainingState>((set, get) => ({
  ...INITIAL_STATE,

  // -- Setters (called by WebSocket hook) ---------------------------------

  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error }),
  setStatusText: (text) => set({ statusText: text }),
  addSampleUrl: (url) =>
    set((s) => {
      const urls = [...s.sampleUrls, url];
      if (urls.length > 50) urls.shift();
      return { sampleUrls: urls, latestSample: url };
    }),
  clearSamples: () => set({ sampleUrls: [], latestSample: null }),
  reset: () => set(INITIAL_STATE),

  // -- State recovery -------------------------------------------------------

  fetchStatus: async () => {
    try {
      const res = await trainingApi.getStatus();
      if (res.status === "running") {
        set({ status: "training" });
      } else if (res.status === "stopping") {
        set({ status: "training", statusText: "Stopping..." });
      } else if (res.status === "error") {
        set({ status: "error", error: res.error });
      } else {
        set({ status: "idle" });
      }
    } catch {
      // Backend unreachable — leave current status unchanged
    }
  },

  // -- Training control actions -------------------------------------------

  startTraining: async (options?: { reattach?: boolean }) => {
    const { status } = get();
    if (status === "training" || status === "preparing") return;

    set({ status: "preparing", error: null, statusText: options?.reattach ? "Reattaching..." : "Starting training..." });

    try {
      const res = await trainingApi.start(options);
      if (!res.ok) {
        set({ status: "error", error: res.error, statusText: res.error ?? "Failed to start" });
      } else {
        set({ startTime: Date.now() });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start training";
      set({ status: "error", error: message, statusText: message });
    }
  },

  stopTraining: async () => {
    try {
      const res = await trainingApi.stop();
      if (res.ok) {
        set({ statusText: "Stopping..." });
      }
    } catch {
      // Ignore — the status will update via WebSocket
    }
  },

  sampleNow: async () => {
    try {
      await trainingApi.sample();
    } catch {
      // Ignore — best effort
    }
  },

  backupNow: async () => {
    try {
      await trainingApi.backup();
    } catch {
      // Ignore — best effort
    }
  },

  saveNow: async () => {
    try {
      await trainingApi.save();
    } catch {
      // Ignore — best effort
    }
  },
}));
