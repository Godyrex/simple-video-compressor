import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

const CHANNELS = {
  PROBE: "probe",
  COMPRESS_START: "compress:start",
  COMPRESS_PROGRESS: "compress:progress",
  COMPRESS_DONE: "compress:done",
  COMPRESS_ERROR: "compress:error",
  COMPRESS_CANCEL: "compress:cancel",
  SELECT_FOLDER: "select-folder",
  DELETE_FILE: "delete-file",
} as const;

contextBridge.exposeInMainWorld("api", {
  probe: async (filePath: string) => {
    return await ipcRenderer.invoke(CHANNELS.PROBE, filePath);
  },
  selectFolder: async () => {
    return await ipcRenderer.invoke(CHANNELS.SELECT_FOLDER);
  },
  deleteFile: async (filePath: string) => {
    return await ipcRenderer.invoke(CHANNELS.DELETE_FILE, filePath);
  },
  startCompression: (payload: any) => {
    ipcRenderer.send(CHANNELS.COMPRESS_START, payload);
  },
  cancelCompression: (id: string) => {
    ipcRenderer.send(CHANNELS.COMPRESS_CANCEL, { id });
  },
  onProgress: (cb: (event: IpcRendererEvent, payload: any) => void) => {
    const listener = (event: IpcRendererEvent, payload: any) =>
      cb(event, payload);
    ipcRenderer.on(CHANNELS.COMPRESS_PROGRESS, listener);
    return () =>
      ipcRenderer.removeListener(CHANNELS.COMPRESS_PROGRESS, listener);
  },
  onDone: (cb: (event: IpcRendererEvent, payload: any) => void) => {
    const listener = (event: IpcRendererEvent, payload: any) =>
      cb(event, payload);
    ipcRenderer.on(CHANNELS.COMPRESS_DONE, listener);
    return () => ipcRenderer.removeListener(CHANNELS.COMPRESS_DONE, listener);
  },
  onError: (cb: (event: IpcRendererEvent, payload: any) => void) => {
    const listener = (event: IpcRendererEvent, payload: any) =>
      cb(event, payload);
    ipcRenderer.on(CHANNELS.COMPRESS_ERROR, listener);
    return () => ipcRenderer.removeListener(CHANNELS.COMPRESS_ERROR, listener);
  },
});
