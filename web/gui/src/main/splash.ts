import { BrowserWindow } from "electron";
import * as path from "path";
import * as fs from "fs";

let splashWindow: BrowserWindow | null = null;

export function createSplashWindow(): BrowserWindow | null {
  const splashPath = path.join(__dirname, "splash.html");
  if (!fs.existsSync(splashPath)) {
    console.warn("[Electron] splash.html not found, skipping splash screen");
    return null;
  }

  splashWindow = new BrowserWindow({
    width: 480,
    height: 380,
    frame: false,
    resizable: false,
    backgroundColor: "#120B17",
    show: false,
    center: true,
    skipTaskbar: false,
    title: "OneTrainerWeb",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(splashPath);

  splashWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show();
    }
  });

  splashWindow.on("closed", () => {
    splashWindow = null;
  });

  return splashWindow;
}

function sanitizeMessage(msg: string): string {
  return msg
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

export function updateSplash(
  step: number,
  percent: number,
  message: string,
): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const safeMsg = sanitizeMessage(message);
  splashWindow.webContents
    .executeJavaScript(
      `updateProgress(${step}, ${percent}, '${safeMsg}')`,
    )
    .catch(() => {
      /* splash may have been destroyed */
    });
}

export function showSplashError(message: string): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const safeMsg = sanitizeMessage(message);
  splashWindow.webContents
    .executeJavaScript(`showError('${safeMsg}')`)
    .catch(() => {
      /* splash may have been destroyed */
    });
}

export async function closeSplash(
  mainWindow: BrowserWindow,
  delayMs = 400,
): Promise<void> {
  if (!splashWindow || splashWindow.isDestroyed()) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.maximize();
      mainWindow.show();
    }
    return;
  }

  updateSplash(5, 100, "Ready!");

  await new Promise((r) => setTimeout(r, delayMs));

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.maximize();
    mainWindow.show();
  }

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}
