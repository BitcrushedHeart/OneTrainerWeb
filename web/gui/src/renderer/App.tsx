import { useEffect } from "react";
import { useUiStore, type TabId } from "./store/uiStore";
import { configApi } from "./api/configApi";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "model", label: "Model" },
  { id: "data", label: "Data" },
  { id: "concepts", label: "Concepts" },
  { id: "training", label: "Training" },
  { id: "sampling", label: "Sampling" },
  { id: "backup", label: "Backup" },
  { id: "tools", label: "Tools" },
  { id: "embeddings", label: "Additional Embeddings" },
  { id: "cloud", label: "Cloud" },
  { id: "performance", label: "Performance" },
  { id: "run", label: "Run" },
];

function TopBar() {
  const { theme, toggleTheme, backendConnected } = useUiStore();

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <h1 className="top-bar-title">OneTrainerWeb</h1>
        <span className={`connection-status ${backendConnected ? "connected" : "disconnected"}`}>
          {backendConnected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="top-bar-right">
        <button
          onClick={toggleTheme}
          className="theme-toggle"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? "Daybreak" : "Nightcode"}
        </button>
      </div>
    </header>
  );
}

function TabNavigation() {
  const { activeTab, setActiveTab } = useUiStore();

  return (
    <nav className="tab-nav" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function TabContent() {
  const { activeTab } = useUiStore();

  return (
    <main className="tab-content" role="tabpanel">
      <div className="card" style={{ padding: "24px" }}>
        <h2 style={{ margin: 0 }}>
          {TABS.find((t) => t.id === activeTab)?.label ?? activeTab}
        </h2>
        <p style={{ color: "var(--color-on-surface-secondary)", marginTop: "8px" }}>
          Tab content will be implemented in Phase 3.
        </p>
      </div>
    </main>
  );
}

function BottomBar() {
  return (
    <footer className="bottom-bar">
      <div className="bottom-bar-left">
        <div className="progress-placeholder">
          <span style={{ color: "var(--color-on-surface-secondary)", fontSize: "14px" }}>
            Ready
          </span>
        </div>
      </div>
      <div className="bottom-bar-right">
        <button className="action-button" disabled>
          Start Training
        </button>
      </div>
    </footer>
  );
}

export default function App() {
  const { setBackendConnected } = useUiStore();

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

    // Poll health every 5s
    checkHealth();
    const interval = setInterval(checkHealth, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setBackendConnected]);

  return (
    <div className="app-shell">
      <TopBar />
      <TabNavigation />
      <TabContent />
      <BottomBar />
    </div>
  );
}
