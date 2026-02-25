import { DualProgress } from "@/components/shared";
import { Download, Bug, Play, Square, Camera, Save, HardDrive, Loader2, RefreshCw } from "lucide-react";
import { useConfigStore, getByPath } from "@/store/configStore";
import { useTrainingStore } from "@/store/trainingStore";
import { useUiStore } from "@/store/uiStore";

export default function BottomBar() {
  const exportConfig = useConfigStore((s) => s.exportConfig);
  const isDirty = useConfigStore((s) => s.isDirty);
  const loadedPresetName = useConfigStore((s) => s.loadedPresetName);

  const config = useConfigStore((s) => s.config);
  const cloudEnabled = config ? getByPath(config as unknown as Record<string, unknown>, "cloud.enabled") === true : false;

  const backendConnected = useUiStore((s) => s.backendConnected);
  const status = useTrainingStore((s) => s.status);
  const progress = useTrainingStore((s) => s.progress);
  const statusText = useTrainingStore((s) => s.statusText);
  const error = useTrainingStore((s) => s.error);
  const latestSample = useTrainingStore((s) => s.latestSample);
  const startTraining = useTrainingStore((s) => s.startTraining);
  const stopTraining = useTrainingStore((s) => s.stopTraining);
  const sampleNow = useTrainingStore((s) => s.sampleNow);
  const backupNow = useTrainingStore((s) => s.backupNow);
  const saveNow = useTrainingStore((s) => s.saveNow);

  const isActive = status === "training" || status === "preparing";
  const isStopping = statusText === "Stopping...";

  const epochProgress = progress
    ? progress.maxEpoch > 0
      ? (progress.epoch / progress.maxEpoch) * 100
      : 0
    : 0;
  const stepProgress = progress
    ? progress.maxStep > 0
      ? (progress.step / progress.maxStep) * 100
      : 0
    : 0;

  const handleExport = async () => {
    try {
      const config = await exportConfig();
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "train_config.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* handled by store */
    }
  };

  const handleTrainingButton = () => {
    if (isActive) {
      stopTraining();
    } else {
      startTraining();
    }
  };

  return (
    <footer className="bottom-bar">
      <div className="bottom-bar-left" role="status" aria-live="polite" aria-atomic="true">
        {isActive ? (
          <>
            <DualProgress
              epochProgress={epochProgress}
              stepProgress={stepProgress}
              epochLabel={progress ? `Epoch ${progress.epoch}/${progress.maxEpoch}` : "Epoch"}
              stepLabel={progress ? `Step ${progress.step}/${progress.maxStep}` : "Step"}
            />
            <span className="text-sm text-[var(--color-on-surface-secondary)] ml-2">
              {statusText || "Training..."}
            </span>
          </>
        ) : status === "error" ? (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            <span className="text-sm font-medium text-red-400">
              {error || statusText || "Training error"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            <span className="text-sm font-medium text-[var(--color-on-surface)]">
              Ready to Train
            </span>
            {loadedPresetName && (
              <span className="text-xs text-[var(--color-on-surface-secondary)] ml-2">
                {loadedPresetName.replace(/^#/, "")}
              </span>
            )}
            {isDirty && (
              <span className="text-xs text-[var(--color-orchid-600)] ml-1">(modified)</span>
            )}
          </div>
        )}
      </div>

      <div className="bottom-bar-right">
        {/* Training-only action buttons */}
        {isActive && (
          <>
            <button
              onClick={sampleNow}
              className="theme-toggle"
              aria-label="Sample Now"
              title="Sample Now"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              onClick={backupNow}
              className="theme-toggle"
              aria-label="Backup Now"
              title="Backup Now"
            >
              <HardDrive className="w-4 h-4" />
            </button>
            <button
              onClick={saveNow}
              className="theme-toggle"
              aria-label="Save Now"
              title="Save Now"
            >
              <Save className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Latest sample preview thumbnail */}
        {latestSample && (
          <img
            src={latestSample}
            alt="Latest sample"
            className="h-8 w-8 rounded object-cover border border-[var(--color-border)]"
            title="Latest training sample"
          />
        )}

        <button onClick={handleExport} className="theme-toggle" aria-label="Export config" title="Export config">
          <Download className="w-4 h-4" />
        </button>
        <button className="theme-toggle" disabled aria-label="Debug" title="Debug">
          <Bug className="w-4 h-4" />
        </button>

        {/* Cloud Reattach button — shown when cloud is enabled and not training */}
        {cloudEnabled && !isActive && (
          <button
            className="action-button"
            onClick={() => startTraining({ reattach: true })}
            disabled={!backendConnected}
            title="Reattach to a detached cloud training run"
          >
            <RefreshCw className="w-4 h-4 inline mr-1" /> Reattach
          </button>
        )}

        {/* Start/Stop Training button */}
        <button
          className="action-button"
          onClick={handleTrainingButton}
          disabled={isStopping || (!isActive && !backendConnected)}
        >
          {isStopping ? (
            <><Loader2 className="w-4 h-4 inline mr-1 animate-spin" /> Stopping...</>
          ) : isActive ? (
            <><Square className="w-4 h-4 inline mr-1" /> Stop Training</>
          ) : (
            <><Play className="w-4 h-4 inline mr-1" /> Start Training</>
          )}
        </button>
      </div>
    </footer>
  );
}
