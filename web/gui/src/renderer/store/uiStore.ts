import { create } from "zustand";
import { type Theme, getInitialTheme, applyTheme } from "../styles/theme";

export type TabId =
  | "general"
  | "model"
  | "data"
  | "concepts"
  | "training"
  | "sampling"
  | "backup"
  | "tools"
  | "embeddings"
  | "cloud"
  | "lora"
  | "embedding"
  | "performance"
  | "run";

interface UiState {
  activeTab: TabId;
  theme: Theme;
  backendConnected: boolean;
  setActiveTab: (tab: TabId) => void;
  toggleTheme: () => void;
  setBackendConnected: (connected: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "general",
  theme: getInitialTheme(),
  backendConnected: false,

  setActiveTab: (tab) => set({ activeTab: tab }),

  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      return { theme: next };
    }),

  setBackendConnected: (connected) => set({ backendConnected: connected }),
}));
