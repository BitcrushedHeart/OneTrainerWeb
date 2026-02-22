/** Typed IPC channel constants shared between main and renderer processes */
export const IPC_CHANNELS = {
  OPEN_FILE: "dialog:openFile",
  OPEN_DIRECTORY: "dialog:openDirectory",
  SAVE_FILE: "dialog:saveFile",
  GET_APP_PATH: "app:getPath",
  RESTART_BACKEND: "backend:restart",
  GET_PLATFORM_INFO: "app:getPlatformInfo",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
