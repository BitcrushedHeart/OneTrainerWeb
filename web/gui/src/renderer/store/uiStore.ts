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
  | "tensorboard"
  | "embeddings"
  | "cloud"
  | "lora"
  | "embedding"
  | "performance"
  | "run"
  | "help";

interface UiState {
  activeTab: TabId;
  theme: Theme;
  backendConnected: boolean;
  terminalOpen: boolean;
  setActiveTab: (tab: TabId) => void;
  toggleTheme: () => void;
  setBackendConnected: (connected: boolean) => void;
  setTerminalOpen: (open: boolean) => void;
  toggleTerminal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "general",
  theme: getInitialTheme(),
  backendConnected: false,
  terminalOpen: false,

  setActiveTab: (tab) => set({ activeTab: tab }),

  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      return { theme: next };
    }),

  setBackendConnected: (connected) => set({ backendConnected: connected }),
  setTerminalOpen: (open) => set({ terminalOpen: open }),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
}));
