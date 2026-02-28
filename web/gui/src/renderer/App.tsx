import { lazy, Suspense, useEffect } from "react";
import { useUiStore } from "./store/uiStore";
import { useConfigStore } from "./store/configStore";
import { useTrainingStore } from "./store/trainingStore";
import { configApi } from "./api/configApi";
import { useTrainingWebSocket } from "./hooks/useTrainingWebSocket";
import { ErrorBoundary } from "./components/ErrorBoundary";
import TopBar from "./components/layout/TopBar";
import BottomBar from "./components/layout/BottomBar";
import TabNavigation from "./components/layout/TabNavigation";
import TerminalPanel from "./components/layout/TerminalPanel";

// Lazy-loaded page components for code splitting
const GeneralPage = lazy(() => import("./pages/GeneralPage"));
const ModelPage = lazy(() => import("./pages/ModelPage"));
const DataPage = lazy(() => import("./pages/DataPage"));
const ConceptsPage = lazy(() => import("./pages/ConceptsPage"));
const TrainingPage = lazy(() => import("./pages/TrainingPage"));
const SamplingPage = lazy(() => import("./pages/SamplingPage"));
const BackupPage = lazy(() => import("./pages/BackupPage"));
const ToolsPage = lazy(() => import("./pages/ToolsPage"));
const LoraPage = lazy(() => import("./pages/LoraPage"));
const EmbeddingPage = lazy(() => import("./pages/EmbeddingPage"));
const AdditionalEmbeddingsPage = lazy(() => import("./pages/AdditionalEmbeddingsPage"));
const CloudPage = lazy(() => import("./pages/CloudPage"));
const TensorboardPage = lazy(() => import("./pages/TensorboardPage"));
const PerformancePage = lazy(() => import("./pages/PerformancePage"));
const RunPage = lazy(() => import("./pages/RunPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));

function TabContent() {
  const activeTab = useUiStore((s) => s.activeTab);

  switch (activeTab) {
    case "general":
      return <GeneralPage />;
    case "model":
      return <ModelPage />;
    case "data":
      return <DataPage />;
    case "concepts":
      return <ConceptsPage />;
    case "training":
      return <TrainingPage />;
    case "sampling":
      return <SamplingPage />;
    case "backup":
      return <BackupPage />;
    case "tools":
      return <ToolsPage />;
    case "lora":
      return <LoraPage />;
    case "embedding":
      return <EmbeddingPage />;
    case "embeddings":
      return <AdditionalEmbeddingsPage />;
    case "cloud":
      return <CloudPage />;
    case "tensorboard":
      return <TensorboardPage />;
    case "performance":
      return <PerformancePage />;
    case "run":
      return <RunPage />;
    case "help":
      return <HelpPage />;
    default:
      return (
        <div className="card" style={{ padding: "24px" }}>
          <h2 style={{ margin: 0 }}>{activeTab}</h2>
          <p style={{ color: "var(--color-on-surface-secondary)", marginTop: "8px" }}>
            This tab will be implemented soon.
          </p>
        </div>
      );
  }
}

export default function App() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setBackendConnected = useUiStore((s) => s.setBackendConnected);
  const backendConnected = useUiStore((s) => s.backendConnected);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const autoLoadPreset = useConfigStore((s) => s.autoLoadPreset);
  const fetchTrainingStatus = useTrainingStore((s) => s.fetchStatus);

  // Connect to training WebSocket when backend is available
  useTrainingWebSocket(backendConnected);

  // Health check polling
  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const data = await configApi.health();
        if (!cancelled && data.status === "ok") {
          setBackendConnected(true);
        }
      } catch {
        if (!cancelled) setBackendConnected(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setBackendConnected]);

  // On backend connect: load config, auto-load last preset, and recover training state
  useEffect(() => {
    if (!backendConnected) return;
    const init = async () => {
      await loadConfig();
      await autoLoadPreset();
      await fetchTrainingStatus();
    };
    init().catch((err) => {
      console.error("App initialization failed:", err);
    });
  }, [backendConnected, loadConfig, autoLoadPreset, fetchTrainingStatus]);

  return (
    <div className="app-shell">
      <TopBar />
      <TabNavigation />
      <main
        className="tab-content"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        <div className="tab-content-inner">
          <Suspense fallback={<div className="skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Loading page" />}>
            <ErrorBoundary>
              <TabContent />
            </ErrorBoundary>
          </Suspense>
        </div>
      </main>
      {terminalOpen && (
        <TerminalPanel isOpen={terminalOpen} backendConnected={backendConnected} />
      )}
      <BottomBar />
    </div>
  );
}
