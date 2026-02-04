import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { SttManager } from './stt/manager';

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const preloadPath = path.join(__dirname, 'preload.js');
const sttManager = new SttManager();

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Voice of the Dungeon',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  });

  if (isDev && !fs.existsSync(preloadPath)) {
    console.warn(`Preload script not found at ${preloadPath}`);
  }

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
    if (process.env.VOD_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html');
    mainWindow.loadFile(indexPath);
  }

  sttManager.on('status', (status) => {
    mainWindow.webContents.send('stt:status', status);
  });
}

app.whenReady().then(() => {
  createMainWindow();
  sttManager.ensureReady().catch(() => {
    // Status updates are sent through the manager.
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  sttManager.stop().catch(() => {});
});

ipcMain.handle('ping', (_event: unknown, message: string) => {
  return `pong: ${message}`;
});

ipcMain.handle('stt:transcribe', async (_event: unknown, audioBuffer: ArrayBuffer) => {
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    return { text: '', error: 'empty_audio' };
  }

  await sttManager.ensureReady();

  if (sttManager.getStatus().state !== 'running') {
    return { text: '', error: 'stt_unavailable' };
  }

  const sttUrl = process.env.VOD_STT_URL ?? sttManager.getTranscriptionUrl();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const form = new FormData();
    const audioBlob = new Blob([Buffer.from(audioBuffer)], { type: 'audio/wav' });
    form.append('file', audioBlob, 'audio.wav');
    form.append('model', process.env.VOD_STT_MODEL ?? 'small');
    form.append('language', process.env.VOD_STT_LANG ?? 'en');

    const response = await fetch(sttUrl, {
      method: 'POST',
      body: form,
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      const trimmed = detail ? detail.slice(0, 500) : '';
      return {
        text: '',
        error: trimmed ? `stt_http_${response.status}: ${trimmed}` : `stt_http_${response.status}`
      };
    }

    const data = (await response.json()) as { text?: string };
    return { text: data.text ?? '' };
  } catch (error) {
    await sttManager.restart();
    const message = error instanceof Error ? error.message : String(error);
    console.error('STT request failed:', message);
    return { text: '', error: `stt_request_failed: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
});

ipcMain.handle('stt:status', () => {
  return sttManager.getStatus();
});

ipcMain.handle('stt:ensure', async () => {
  await sttManager.ensureReady();
  return sttManager.getStatus();
});
