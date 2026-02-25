import { useEffect, useState } from "react";
import { Sun, Moon, Save } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { useConfigStore } from "@/store/configStore";
import { useConfigField } from "@/hooks/useConfigField";
import { configApi, type PresetInfo } from "@/api/configApi";
import { ModelTypeValues } from "@/types/generated/enums";
import type { ModelType, TrainingMethod } from "@/types/generated/enums";
import { enumLabel } from "@/utils/enumLabels";

// Training methods available per model type family
function getMethodsForModel(modelType: ModelType): TrainingMethod[] {
  const all4: TrainingMethod[] = ["FINE_TUNE", "LORA", "EMBEDDING", "FINE_TUNE_VAE"];
  const all3: TrainingMethod[] = ["FINE_TUNE", "LORA", "EMBEDDING"];
  const just2: TrainingMethod[] = ["FINE_TUNE", "LORA"];

  // SD 1.5, 2.0, 2.1 variants support all 4 methods (includes FINE_TUNE_VAE)
  if (
    modelType.startsWith("STABLE_DIFFUSION_15") ||
    modelType.startsWith("STABLE_DIFFUSION_20") ||
    modelType.startsWith("STABLE_DIFFUSION_21")
  )
    return all4;
  // Flux 2, Qwen, Z-Image only support FINE_TUNE and LORA
  if (modelType === "FLUX_2" || modelType === "QWEN" || modelType === "Z_IMAGE") return just2;
  // All others support FINE_TUNE, LORA, EMBEDDING
  return all3;
}

export default function TopBar() {
  const { theme, toggleTheme, backendConnected } = useUiStore();
  const loadPreset = useConfigStore((s) => s.loadPreset);
  const savePreset = useConfigStore((s) => s.savePreset);
  const loadedPresetName = useConfigStore((s) => s.loadedPresetName);
  const [modelType, setModelType] = useConfigField<ModelType>("model_type");
  const [trainingMethod, setTrainingMethod] = useConfigField<TrainingMethod>("training_method");
  const [presets, setPresets] = useState<PresetInfo[]>([]);

  useEffect(() => {
    if (backendConnected) {
      configApi
        .listPresets()
        .then(setPresets)
        .catch((err) => {
          console.error("[TopBar] Failed to fetch presets:", err);
        });
    }
  }, [backendConnected]);

  const availableMethods = getMethodsForModel(modelType ?? "STABLE_DIFFUSION_15");

  const handlePresetLoad = (path: string) => {
    const preset = presets.find((p) => p.path === path);
    loadPreset(path, preset?.name);
  };
  const handleSavePreset = () => {
    const name = prompt("Preset name:");
    if (name) savePreset(name);
  };
  const handleModelChange = (val: string) => {
    setModelType(val as ModelType);
    // If current training method is not compatible with new model, reset to FINE_TUNE
    const methods = getMethodsForModel(val as ModelType);
    if (trainingMethod && !methods.includes(trainingMethod)) {
      setTrainingMethod("FINE_TUNE");
    }
  };

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <h1 className="top-bar-title">OneTrainer</h1>
        <span className={`connection-status ${backendConnected ? "connected" : "disconnected"}`}>
          {backendConnected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="top-bar-right">
        {/* Preset selector */}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) handlePresetLoad(e.target.value);
          }}
          className="top-bar-select"
        >
          <option value="" disabled>
            {loadedPresetName ? `Preset: ${loadedPresetName.replace(/^#/, "")}` : "Load Preset..."}
          </option>
          {presets.filter((p) => p.is_builtin).length > 0 && (
            <optgroup label="Built-in">
              {presets
                .filter((p) => p.is_builtin)
                .map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          )}
          {presets.filter((p) => !p.is_builtin).length > 0 && (
            <optgroup label="User">
              {presets
                .filter((p) => !p.is_builtin)
                .map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
        <button onClick={handleSavePreset} className="theme-toggle" aria-label="Save preset" title="Save preset">
          <Save className="w-4 h-4" />
        </button>

        <div className="top-bar-separator" aria-hidden="true" />

        {/* Model type */}
        <select
          value={modelType ?? "STABLE_DIFFUSION_15"}
          onChange={(e) => handleModelChange(e.target.value)}
          className="top-bar-select"
        >
          {ModelTypeValues.map((mt) => (
            <option key={mt} value={mt}>
              {enumLabel(mt)}
            </option>
          ))}
        </select>

        {/* Training method */}
        <select
          value={trainingMethod ?? "FINE_TUNE"}
          onChange={(e) => setTrainingMethod(e.target.value as TrainingMethod)}
          className="top-bar-select"
        >
          {availableMethods.map((m) => (
            <option key={m} value={m}>
              {enumLabel(m)}
            </option>
          ))}
        </select>

        <div className="top-bar-separator" aria-hidden="true" />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="theme-toggle"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
