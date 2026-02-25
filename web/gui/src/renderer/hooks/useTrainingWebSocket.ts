/**
 * React hook for connecting to the /ws/training WebSocket endpoint.
 *
 * Dispatches incoming progress/status/sample/error messages to the
 * training Zustand store.  Handles reconnection with exponential backoff.
 *
 * Progress messages are throttled via requestAnimationFrame so the UI
 * never re-renders faster than ~60fps, regardless of WebSocket throughput.
 */

import { useCallback, useEffect, useRef } from "react";
import { useTrainingStore } from "@/store/trainingStore";

// Protocol-aware WebSocket URL
const isFileProtocol =
  typeof window !== "undefined" && window.location.protocol === "file:";
const WS_BASE = isFileProtocol
  ? "ws://localhost:8000"
  : `ws://${window.location.host}`;

const WS_URL = `${WS_BASE}/ws/training`;

// Reconnection parameters
const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;
const BACKOFF_FACTOR = 2;

/**
 * WebSocket message types emitted by the training backend.
 */
interface ProgressData {
  epoch: number;
  epoch_step: number;
  epoch_sample: number;
  global_step: number;
  max_step: number;
  max_epoch: number;
}

interface StatusData {
  text: string;
}

interface SampleData {
  file_type: string;
  format: string;
  data: string | null;
}

interface SampleProgressData {
  step: number;
  max_step: number;
}

interface ErrorData {
  message: string;
}

type WsMessage =
  | { type: "progress"; data: ProgressData }
  | { type: "status"; data: StatusData }
  | { type: "sample"; data: SampleData }
  | { type: "sample_progress"; data: SampleProgressData }
  | { type: "error"; data: ErrorData };

/**
 * Connect to the training WebSocket and dispatch events to the store.
 *
 * Call this hook once at the app root level.  It manages its own
 * lifecycle, reconnecting automatically when the connection drops.
 *
 * @param enabled - Set to `false` to prevent connecting (e.g. when
 *   the backend is not yet available).
 */
export function useTrainingWebSocket(enabled = true): void {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(INITIAL_RETRY_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // rAF-based throttling: buffer the latest progress message and flush at
  // ~60fps to avoid excessive re-renders during high-frequency updates.
  // Only progress messages are throttled; status, sample, and error messages
  // are applied immediately since they carry important state transitions.
  const progressBufferRef = useRef<ProgressData | null>(null);
  const rafRef = useRef<number | null>(null);

  // Pull stable action references from the store (they don't change)
  const setStatus = useTrainingStore((s) => s.setStatus);
  const setProgress = useTrainingStore((s) => s.setProgress);
  const setError = useTrainingStore((s) => s.setError);
  const setStatusText = useTrainingStore((s) => s.setStatusText);
  const addSampleUrl = useTrainingStore((s) => s.addSampleUrl);

  /** Flush the buffered progress data to the store. Called once per animation frame. */
  const flushProgressBuffer = useCallback(() => {
    const data = progressBufferRef.current;
    if (data) {
      setProgress({
        step: data.epoch_step,
        maxStep: data.max_step,
        epoch: data.epoch,
        maxEpoch: data.max_epoch,
        loss: null,
        learningRate: null,
        elapsedTime: null,
        remainingTime: null,
      });
      setStatus("training");
      progressBufferRef.current = null;
    }
    rafRef.current = null;
  }, [setProgress, setStatus]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) return;

    function connect() {
      if (!mountedRef.current) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = INITIAL_RETRY_MS; // reset backoff on success
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          handleMessage(msg);
        } catch {
          // Ignore unparseable messages
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, which triggers reconnect
        ws.close();
      };
    }

    function handleMessage(msg: WsMessage) {
      switch (msg.type) {
        case "progress": {
          // Buffer progress messages and schedule a rAF flush.
          // Only the latest progress data matters -- intermediate values
          // are dropped so the UI never updates faster than the display.
          progressBufferRef.current = msg.data;
          if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(flushProgressBuffer);
          }
          break;
        }

        case "status": {
          const text = msg.data.text;
          setStatusText(text);

          // Infer training state from status text
          if (text.startsWith("Error")) {
            setStatus("error");
          } else if (text === "Stopped") {
            setStatus("idle");
          } else if (text === "Stopping...") {
            // Don't change status -- training thread is still winding down.
            // Status will be set to "idle" when "Stopped" arrives.
          } else if (text.startsWith("Starting")) {
            setStatus("preparing");
          }
          break;
        }

        case "sample": {
          const d = msg.data;
          if (d.data) {
            // Convert base64 to a data URL for display
            const mimeType =
              d.file_type === "IMAGE"
                ? "image/png"
                : d.file_type === "VIDEO"
                  ? "video/mp4"
                  : "application/octet-stream";
            const dataUrl = `data:${mimeType};base64,${d.data}`;
            addSampleUrl(dataUrl);
          }
          break;
        }

        case "sample_progress": {
          // Could dispatch to a sampling progress sub-state
          // For now, update the status text
          setStatusText(
            `Sampling: step ${msg.data.step}/${msg.data.max_step}`,
          );
          break;
        }

        case "error": {
          setStatus("error");
          setError(msg.data.message);
          break;
        }
      }
    }

    function scheduleReconnect() {
      if (!mountedRef.current) return;

      retryTimerRef.current = setTimeout(() => {
        retryRef.current = Math.min(
          retryRef.current * BACKOFF_FACTOR,
          MAX_RETRY_MS,
        );
        connect();
      }, retryRef.current);
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      progressBufferRef.current = null;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, setStatus, setProgress, setError, setStatusText, addSampleUrl, flushProgressBuffer]);
}
