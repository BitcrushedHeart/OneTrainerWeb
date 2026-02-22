/** Shared type definitions for the Electron API bridge.
 *  Used by both the preload script (main process) and the renderer. */

export interface PlatformInfo {
  platform: string;
  isPackaged: boolean;
  version: string;
  projectRoot: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface ElectronAPI {
  isElectron: true;
  platform: string;
  openFile: (filters?: FileFilter[]) => Promise<string | null>;
  openDirectory: () => Promise<string | null>;
  saveFile: (
    defaultPath?: string,
    filters?: FileFilter[],
  ) => Promise<string | null>;
  getAppPath: () => Promise<string>;
  restartBackend: () => Promise<boolean>;
  getPlatformInfo: () => Promise<PlatformInfo>;
}
