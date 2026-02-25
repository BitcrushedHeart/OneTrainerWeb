import { useState, useEffect, useRef } from "react";
import { ModalBase } from "./ModalBase";
import { Button, FormEntry, Select, Toggle, ProgressBar, DirPicker } from "@/components/shared";
import { toolsApi, type ToolStatusResponse } from "@/api/toolsApi";

export interface CaptionToolModalProps {
  open: boolean;
  onClose: () => void;
}

const CAPTION_MODELS = ["Blip", "Blip2", "WD14 VIT v2"];

const CAPTION_MODES = ["replace", "fill", "add"];
const CAPTION_MODE_LABELS: Record<string, string> = {
  replace: "Replace all captions",
  fill: "Create if absent",
  add: "Add as new line",
};

interface CaptionState {
  model: string;
  folder: string;
  initial_caption: string;
  caption_prefix: string;
  caption_postfix: string;
  mode: string;
  include_subdirectories: boolean;
}

const DEFAULT_STATE: CaptionState = {
  model: "Blip",
  folder: "",
  initial_caption: "",
  caption_prefix: "",
  caption_postfix: "",
  mode: "fill",
  include_subdirectories: false,
};

export function CaptionToolModal({ open, onClose }: CaptionToolModalProps) {
  const [state, setState] = useState<CaptionState>({ ...DEFAULT_STATE });
  const [status, setStatus] = useState<ToolStatusResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const update = <K extends keyof CaptionState>(field: K, value: CaptionState[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  // Poll for status while running
  useEffect(() => {
    if (!isRunning) return;

    const poll = async () => {
      try {
        const s = await toolsApi.getStatus();
        setStatus(s);
        if (s.status === "completed" || s.status === "error" || s.status === "idle") {
          setIsRunning(false);
          if (s.status === "error" && s.error) {
            setError(s.error);
          }
        }
      } catch {
        // Ignore poll errors
      }
    };

    pollRef.current = setInterval(poll, 500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isRunning]);

  const handleGenerate = async () => {
    if (!state.folder) {
      setError("Please select a folder.");
      return;
    }
    setError(null);
    setIsRunning(true);
    setStatus(null);

    try {
      const result = await toolsApi.generateCaptions({
        model: state.model,
        folder: state.folder,
        initial_caption: state.initial_caption,
        caption_prefix: state.caption_prefix,
        caption_postfix: state.caption_postfix,
        mode: state.mode,
        include_subdirectories: state.include_subdirectories,
      });

      if (!result.ok) {
        setError(result.error ?? "Failed to start caption generation");
        setIsRunning(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsRunning(false);
    }
  };

  const handleCancel = async () => {
    try {
      await toolsApi.cancel();
      setIsRunning(false);
    } catch {
      // Ignore cancel errors
    }
  };

  const progress =
    status && status.max_progress > 0
      ? (status.progress / status.max_progress) * 100
      : 0;

  const progressLabel =
    status && status.max_progress > 0
      ? `${status.progress} / ${status.max_progress}`
      : isRunning
        ? "Starting..."
        : "0 / 0";

  return (
    <ModalBase open={open} onClose={onClose} title="Batch Generate Captions" size="md" closeOnBackdrop={!isRunning}>
      <div className="flex flex-col gap-4">
        <Select
          label="Model"
          options={CAPTION_MODELS}
          value={state.model}
          onChange={(v) => update("model", v)}
          disabled={isRunning}
          formatLabel={(v) => v}
        />

        <DirPicker
          label="Folder"
          value={state.folder}
          onChange={(v) => update("folder", v)}
          disabled={isRunning}
        />

        <FormEntry
          label="Initial Caption"
          value={state.initial_caption}
          onChange={(v) => update("initial_caption", String(v))}
          placeholder="Optional initial caption..."
          disabled={isRunning}
        />

        <FormEntry
          label="Caption Prefix"
          value={state.caption_prefix}
          onChange={(v) => update("caption_prefix", String(v))}
          placeholder="Optional prefix..."
          disabled={isRunning}
        />

        <FormEntry
          label="Caption Postfix"
          value={state.caption_postfix}
          onChange={(v) => update("caption_postfix", String(v))}
          placeholder="Optional postfix..."
          disabled={isRunning}
        />

        <Select
          label="Mode"
          options={CAPTION_MODES}
          value={state.mode}
          onChange={(v) => update("mode", v)}
          disabled={isRunning}
          formatLabel={(v) => CAPTION_MODE_LABELS[v] ?? v}
        />

        <Toggle
          label="Include subfolders"
          value={state.include_subdirectories}
          onChange={(v) => update("include_subdirectories", v)}
          disabled={isRunning}
        />

        <div className="pt-2">
          <ProgressBar value={progress} label={progressLabel} indeterminate={isRunning && progress === 0} />
        </div>

        {error && (
          <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-error-500)]/10 border border-[var(--color-error-500)]/30">
            <p className="text-sm text-[var(--color-error-500)]">{error}</p>
          </div>
        )}

        {status?.status === "completed" && (
          <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-orchid-600)]/10 border border-[var(--color-orchid-600)]/30">
            <p className="text-sm text-[var(--color-orchid-600)]">Caption generation completed successfully.</p>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-6 pt-4 border-t border-[var(--color-border-subtle)]">
        <div className="flex gap-2">
          <Button variant="primary" onClick={handleGenerate} disabled={isRunning}>
            {isRunning ? "Generating..." : "Create Captions"}
          </Button>
          {isRunning && (
            <Button variant="danger" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </div>
        <Button variant="secondary" onClick={onClose} disabled={isRunning}>
          Close
        </Button>
      </div>
    </ModalBase>
  );
}
