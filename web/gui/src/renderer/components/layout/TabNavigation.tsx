import { useUiStore, type TabId } from "@/store/uiStore";
import { useConfigField } from "@/hooks/useConfigField";
import type { TrainingMethod, ModelType } from "@/types/generated/enums";
import { TRAINING_METHODS_BY_MODEL } from "@/types/generated/modelTypeInfo";
import { useMemo, useCallback, useRef } from "react";

interface TabDef {
  id: TabId;
  label: string;
  condition?: (method: TrainingMethod | undefined, model: ModelType | undefined) => boolean;
}

const ALL_TABS: TabDef[] = [
  { id: "general", label: "General" },
  { id: "model", label: "Model" },
  { id: "data", label: "Data" },
  { id: "concepts", label: "Concepts" },
  { id: "training", label: "Training" },
  { id: "sampling", label: "Sampling" },
  { id: "backup", label: "Backup" },
  { id: "tools", label: "Tools" },
  { id: "tensorboard", label: "Tensorboard" },
  { id: "lora", label: "LoRA", condition: (m) => m === "LORA" },
  { id: "embedding", label: "Embedding", condition: (m) => m === "EMBEDDING" },
  {
    id: "embeddings",
    label: "Additional Embeddings",
    condition: (_m, model) =>
      model != null && TRAINING_METHODS_BY_MODEL[model]?.includes("EMBEDDING"),
  },
  { id: "cloud", label: "Cloud" },
  { id: "performance", label: "Performance" },
  { id: "run", label: "Run" },
  { id: "help", label: "Help" },
];

export default function TabNavigation() {
  const { activeTab, setActiveTab } = useUiStore();
  const [trainingMethod] = useConfigField<TrainingMethod>("training_method");
  const [modelType] = useConfigField<ModelType>("model_type");
  const navRef = useRef<HTMLElement>(null);

  const visibleTabs = useMemo(
    () => ALL_TABS.filter((t) => !t.condition || t.condition(trainingMethod, modelType)),
    [trainingMethod, modelType],
  );

  const focusTab = useCallback(
    (tabId: TabId) => {
      setActiveTab(tabId);
      const el = navRef.current?.querySelector<HTMLElement>(`#tab-${tabId}`);
      el?.focus();
    },
    [setActiveTab],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const currentIndex = visibleTabs.findIndex((t) => t.id === activeTab);
      if (currentIndex === -1) return;

      let nextIndex: number | null = null;

      switch (e.key) {
        case "ArrowRight":
          nextIndex = (currentIndex + 1) % visibleTabs.length;
          break;
        case "ArrowLeft":
          nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = visibleTabs.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      focusTab(visibleTabs[nextIndex].id);
    },
    [visibleTabs, activeTab, focusTab],
  );

  return (
    <nav className="tab-nav" role="tablist" ref={navRef} onKeyDown={handleKeyDown}>
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
