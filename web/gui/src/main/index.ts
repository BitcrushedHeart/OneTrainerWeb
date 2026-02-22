import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  type FileFilter,
} from "electron";
import { spawn, execSync, type ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import { IPC_CHANNELS } from "../shared/ipc-channels";

// ── Constants ──────────────────────────────────────────────────────
const isWindows = process.platform === "win32";
const BACKEND_PORT = 8000;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const HEALTH_URL = `${BACKEND_URL}/api/health`;
const HEALTH_POLL_INTERVAL = 500;
const MAX_HEALTH_RETRIES = 120; // 120 retries * 500ms = 60s max
const DEV_SERVER_URL = "http://localhost:5173";

// When run_web.bat / run_web_dev.bat start the backend externally,
// they set this env var so Electron doesn't spawn a duplicate.
const externalBackend = process.env.OT_EXTERNAL_BACKEND === "1";

// ── State ──────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
// (no isQuitting flag needed — cleanupPromise gates the quit sequence)

// ── Path Resolution ────────────────────────────────────────────────
// After tsc with rootDir=src, __dirname is web/gui/dist/main/main/
// Project root is 5 levels up: main -> main -> dist -> gui -> web -> root
function getProjectRoot(): string {
  return path.resolve(__dirname, "..", "..", "..", "..", "..");
}

// ── Python Discovery ───────────────────────────────────────────────
function findPython(): string {
  const projectRoot = getProjectRoot();

  // Check venv first (most common)
  const venvPaths = isWindows
    ? [
        path.join(projectRoot, "venv", "Scripts", "python.exe"),
        path.join(projectRoot, ".venv", "Scripts", "python.exe"),
      ]
    : [
        path.join(projectRoot, "venv", "bin", "python"),
        path.join(projectRoot, ".venv", "bin", "python"),
      ];

  for (const p of venvPaths) {
    if (fs.existsSync(p)) {
      console.log(`[Electron] Found Python at: ${p}`);
      return p;
    }
  }

  // Fall back to system Python
  const fallback = isWindows ? "python" : "python3";
  console.log(`[Electron] No venv found, falling back to: ${fallback}`);
  return fallback;
}

// ── Process Management ─────────────────────────────────────────────
function killProcessTree(proc: ChildProcess | null): void {
  if (!proc || proc.killed) return;
  try {
    if (isWindows) {
      execSync(`taskkill /PID ${proc.pid} /T /F`, {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      const pid = proc.pid;
      if (pid === undefined) return;
      // Try to kill the process group first (negative PID)
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        process.kill(pid, "SIGTERM");
      }
      // Force kill after a brief grace period
      setTimeout(() => {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* already dead */
        }
      }, 2000);
    }
  } catch {
    // Process may already be dead
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  }
}

function killStaleBackend(): void {
  // Kill any leftover backend from a previous session on our port
  try {
    if (isWindows) {
      const output = execSync(
        `netstat -ano | findstr ":${BACKEND_PORT} " | findstr "LISTENING"`,
        { windowsHide: true, encoding: "utf8", timeout: 5000 },
      );
      const pids = new Set<string>();
      for (const line of output.trim().split("\n")) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
      }
      for (const pid of pids) {
        console.log(
          `[Electron] Killing stale process on port ${BACKEND_PORT} (PID ${pid})`,
        );
        try {
          execSync(`taskkill /PID ${pid} /T /F`, {
            windowsHide: true,
            stdio: "ignore",
          });
        } catch {
          /* already dead */
        }
      }
    } else {
      execSync(`fuser -k ${BACKEND_PORT}/tcp 2>/dev/null || true`, {
        encoding: "utf8",
        timeout: 5000,
        stdio: "ignore",
      });
    }
  } catch {
    // No process on port -- expected for clean starts
  }
}

// ── Backend Spawning ───────────────────────────────────────────────
function startBackend(): ChildProcess | null {
  if (backendProcess && !backendProcess.killed) {
    killProcessTree(backendProcess);
  }

  killStaleBackend();

  const projectRoot = getProjectRoot();

  if (app.isPackaged) {
    // Packaged mode: use venv python directly with explicit module path
    const python = findPython();
    const proc = spawn(
      python,
      [
        "-m",
        "uvicorn",
        "web.backend.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        String(BACKEND_PORT),
        "--log-level",
        "info",
      ],
      {
        cwd: projectRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        ...(isWindows ? { windowsHide: true } : { detached: true }),
      },
    );

    attachBackendHandlers(proc);
    return proc;
  } else {
    // Dev mode: activate venv and run uvicorn via shell
    const venvActivate = isWindows
      ? path.join(projectRoot, "venv", "Scripts", "activate.bat")
      : path.join(projectRoot, "venv", "bin", "activate");

    let cmd: string;
    if (isWindows) {
      cmd = `call "${venvActivate}" && python -m uvicorn web.backend.main:app --host 127.0.0.1 --port ${BACKEND_PORT} --log-level info`;
    } else {
      cmd = `source "${venvActivate}" && python -m uvicorn web.backend.main:app --host 127.0.0.1 --port ${BACKEND_PORT} --log-level info`;
    }

    const proc = spawn(cmd, [], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      ...(isWindows ? { windowsHide: true } : { detached: true }),
    });

    attachBackendHandlers(proc);
    return proc;
  }
}

function attachBackendHandlers(proc: ChildProcess): void {
  proc.stdout?.on("data", (data: Buffer) => {
    process.stdout.write(`[Backend] ${data}`);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    process.stderr.write(`[Backend] ${data}`);
  });

  proc.on("close", (code) => {
    console.log(`[Backend] Process exited with code ${code}`);
    backendProcess = null;
  });
}

// ── Health Check ───────────────────────────────────────────────────
function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(): Promise<boolean> {
  for (let i = 0; i < MAX_HEALTH_RETRIES; i++) {
    const healthy = await checkHealth();
    if (healthy) {
      console.log(`[Electron] Backend is ready (attempt ${i + 1})`);
      return true;
    }
    console.log(
      `[Electron] Waiting for backend... (${i + 1}/${MAX_HEALTH_RETRIES})`,
    );
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL));
  }
  console.error("[Electron] Backend failed to start within timeout");
  return false;
}

// ── Window ─────────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "OneTrainerWeb",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    // Only open DevTools when explicitly requested
    if (process.env.OT_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "..", "..", "renderer", "index.html"),
    );
  }

  // Navigation guards -- prevent navigating away from the app
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost") return;
    event.preventDefault();
    shell.openExternal(url);
  });

  // Handle new window requests (target="_blank") -- open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── IPC Handlers ───────────────────────────────────────────────────
function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.OPEN_FILE,
    async (_event, filters?: FileFilter[]) => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: filters ?? [],
      });
      return result.canceled ? null : result.filePaths[0];
    },
  );

  ipcMain.handle(IPC_CHANNELS.OPEN_DIRECTORY, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(
    IPC_CHANNELS.SAVE_FILE,
    async (_event, defaultPath?: string, filters?: FileFilter[]) => {
      if (!mainWindow) return null;
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters: filters ?? [],
      });
      return result.canceled ? null : result.filePath;
    },
  );

  ipcMain.handle(IPC_CHANNELS.GET_APP_PATH, () => {
    return app.getAppPath();
  });

  ipcMain.handle(IPC_CHANNELS.RESTART_BACKEND, async () => {
    if (externalBackend) {
      console.log(
        "[Electron] Backend is externally managed; waiting for it to come back...",
      );
      return waitForBackend();
    }

    console.log("[Electron] Restarting backend...");
    killProcessTree(backendProcess);
    backendProcess = startBackend();
    if (!backendProcess) return false;
    return waitForBackend();
  });

  ipcMain.handle(IPC_CHANNELS.GET_PLATFORM_INFO, () => {
    return {
      platform: process.platform,
      isPackaged: app.isPackaged,
      version: app.getVersion(),
      projectRoot: getProjectRoot(),
    };
  });
}

// ── Graceful Shutdown ──────────────────────────────────────────────
function isProcessAlive(proc: ChildProcess | null): boolean {
  if (!proc || proc.killed || proc.pid === undefined) return false;
  try {
    process.kill(proc.pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function gracefulShutdownBackend(timeoutMs = 8000): Promise<void> {
  if (!backendProcess || backendProcess.killed) return;

  // Step 1: Try graceful shutdown via HTTP
  console.log("[Electron] Requesting graceful backend shutdown...");
  try {
    await new Promise<void>((resolve) => {
      const req = http.request(
        {
          hostname: "localhost",
          port: BACKEND_PORT,
          path: "/api/shutdown",
          method: "POST",
          headers: { "Content-Length": 0 },
        },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", () => resolve());
      req.setTimeout(3000, () => {
        req.destroy();
        resolve();
      });
      req.end("");
    });
  } catch {
    console.log("[Electron] Backend unreachable, skipping graceful shutdown");
    killProcessTree(backendProcess);
    return;
  }

  // Step 2: Wait for process to exit on its own
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (!isProcessAlive(backendProcess)) {
      console.log("[Electron] Backend exited gracefully");
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  // Step 3: Force kill
  console.log(
    "[Electron] Backend did not exit within grace period, force-killing",
  );
  killProcessTree(backendProcess);
}

let cleanupPromise: Promise<void> | null = null;

function cleanupAndQuit(): Promise<void> {
  if (cleanupPromise) return cleanupPromise;

  cleanupPromise = (async () => {
    if (!externalBackend) {
      await gracefulShutdownBackend(8000);
    }
  })();

  return cleanupPromise;
}

// ── App Lifecycle ──────────────────────────────────────────────────
async function main(): Promise<void> {
  await app.whenReady();

  registerIpcHandlers();

  // Start backend (unless managed externally by run_web.bat / run_web_dev.bat)
  if (!externalBackend) {
    console.log("[Electron] Starting backend...");
    backendProcess = startBackend();
    if (!backendProcess) {
      console.error("[Electron] Failed to spawn backend process");
      app.quit();
      return;
    }
  } else {
    console.log(
      "[Electron] OT_EXTERNAL_BACKEND=1 -- skipping backend spawn",
    );
  }

  // Wait for backend health
  console.log("[Electron] Waiting for backend to start...");
  const healthy = await waitForBackend();
  if (!healthy) {
    console.error("[Electron] Backend failed to start within timeout");
    if (!externalBackend) {
      killProcessTree(backendProcess);
    }
    app.quit();
    return;
  }
  console.log("[Electron] Backend is healthy");

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

app.on("window-all-closed", () => {
  cleanupAndQuit().finally(() => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
});

app.on("will-quit", (event) => {
  if (cleanupPromise) {
    event.preventDefault();
    cleanupPromise.finally(() => {
      cleanupPromise = null;
      app.quit();
    });
  }
});

// Handle uncaught exceptions gracefully
process.on("uncaughtException", (err) => {
  console.error("[Electron] Uncaught exception:", err);
  if (!externalBackend) {
    killProcessTree(backendProcess);
  }
  app.quit();
});

main().catch(console.error);
