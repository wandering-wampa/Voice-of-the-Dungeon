import { contextBridge, ipcRenderer } from 'electron';

const api = {
  ping: (message: string) => ipcRenderer.invoke('ping', message),
  stt: {
    transcribe: (audioBuffer: ArrayBuffer) =>
      ipcRenderer.invoke('stt:transcribe', audioBuffer),
    getStatus: () => ipcRenderer.invoke('stt:status'),
    ensureReady: () => ipcRenderer.invoke('stt:ensure'),
    onStatus: (callback: (status: { state: string; message?: string; progress?: number }) => void) => {
      const listener = (
        _event: unknown,
        status: { state: string; message?: string; progress?: number }
      ) => {
        callback(status);
      };

      ipcRenderer.on('stt:status', listener);

      return () => {
        ipcRenderer.removeListener('stt:status', listener);
      };
    }
  }
};

contextBridge.exposeInMainWorld('vod', api);
