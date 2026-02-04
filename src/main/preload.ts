import { contextBridge, ipcRenderer } from 'electron';

const api = {
  ping: (message: string) => ipcRenderer.invoke('ping', message)
};

contextBridge.exposeInMainWorld('vod', api);
