import { app } from 'electron';
import { ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export type SttState = 'idle' | 'downloading' | 'starting' | 'running' | 'error';

export type SttStatus = {
  state: SttState;
  message?: string;
  progress?: number;
};

type SttConfig = {
  host: string;
  port: number;
  model: string;
  device: string;
  computeType: string;
  runtimeVersion: string;
  runtimeUrl: string;
  runtimeExe: string;
  runtimeArgs: string[];
};

const DEFAULT_CONFIG: SttConfig = {
  host: '127.0.0.1',
  port: 8000,
  model: 'small',
  device: 'cuda',
  computeType: 'int8_float16',
  runtimeVersion: 'stt-runtime-v0.1.1',
  runtimeUrl:
    'https://github.com/wandering-wampa/Voice-of-the-Dungeon/releases/download/stt-runtime-v0.1.1/vod-stt-win-x64.zip',
  runtimeExe: 'vod-stt-server.exe',
  runtimeArgs: [
    '--host',
    '{host}',
    '--port',
    '{port}',
    '--model',
    '{model}',
    '--device',
    '{device}',
    '--compute-type',
    '{computeType}',
    '--cache-dir',
    '{modelDir}'
  ]
};

export class SttManager extends EventEmitter {
  private status: SttStatus = { state: 'idle' };
  private child: ChildProcess | null = null;
  private logStream: fs.WriteStream | null = null;
  private startPromise: Promise<void> | null = null;
  private config: SttConfig;

  constructor() {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      host: process.env.VOD_STT_HOST ?? DEFAULT_CONFIG.host,
      port: Number(process.env.VOD_STT_PORT ?? DEFAULT_CONFIG.port),
      model: process.env.VOD_STT_MODEL ?? DEFAULT_CONFIG.model,
      device: process.env.VOD_STT_DEVICE ?? DEFAULT_CONFIG.device,
      computeType: process.env.VOD_STT_COMPUTE ?? DEFAULT_CONFIG.computeType,
      runtimeVersion: process.env.VOD_STT_RUNTIME_VERSION ?? DEFAULT_CONFIG.runtimeVersion,
      runtimeUrl: process.env.VOD_STT_RUNTIME_URL ?? DEFAULT_CONFIG.runtimeUrl,
      runtimeExe: process.env.VOD_STT_RUNTIME_EXE ?? DEFAULT_CONFIG.runtimeExe
    };
  }

  getStatus() {
    return this.status;
  }

  async ensureReady() {
    if (this.status.state === 'running') {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startInternal();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async stop() {
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = null;
    this.logStream?.end();
    this.logStream = null;
    this.setStatus({ state: 'idle' });
  }

  private async startInternal() {
    const runtimePath = await this.ensureRuntime();
    if (!runtimePath) {
      this.setStatus({ state: 'error', message: 'STT runtime missing.' });
      return;
    }

    this.setStatus({ state: 'starting', message: 'Starting STT service...' });

    const modelDir = this.getModelDir();
    await fsPromises.mkdir(modelDir, { recursive: true });

    const args = this.config.runtimeArgs.map((arg) =>
      arg
        .replace('{host}', this.config.host)
        .replace('{port}', String(this.config.port))
        .replace('{model}', this.config.model)
        .replace('{device}', this.config.device)
        .replace('{computeType}', this.config.computeType)
        .replace('{modelDir}', modelDir)
    );

    const logDir = path.join(this.getSttRootDir(), 'logs');
    await fsPromises.mkdir(logDir, { recursive: true });
    const logPath = path.join(logDir, `stt-${Date.now()}.log`);
    this.logStream = fs.createWriteStream(logPath, { flags: 'a' });

    this.child = spawn(runtimePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    this.child.stdout?.pipe(this.logStream);
    this.child.stderr?.pipe(this.logStream);

    this.child.on('exit', () => {
      if (this.status.state === 'running') {
        this.setStatus({ state: 'error', message: 'STT service stopped.' });
      }
    });

    const ready = await waitForServer(this.config.host, this.config.port, 30000);
    if (!ready) {
      this.setStatus({ state: 'error', message: 'STT service failed to start.' });
      return;
    }

    this.setStatus({ state: 'running', message: 'STT service ready.' });
  }

  private async ensureRuntime() {
    const runtimeDir = this.getRuntimeDir();
    const runtimePath = path.join(runtimeDir, this.config.runtimeExe);
    const versionPath = path.join(runtimeDir, 'runtime-version.txt');

    if (fs.existsSync(runtimePath) && this.runtimeVersionMatches(versionPath)) {
      return runtimePath;
    }

    if (!this.config.runtimeUrl) {
      return '';
    }

    await fsPromises.rm(runtimeDir, { recursive: true, force: true });
    await fsPromises.mkdir(runtimeDir, { recursive: true });

    const downloadDir = path.join(this.getSttRootDir(), 'downloads');
    await fsPromises.mkdir(downloadDir, { recursive: true });

    const archivePath = path.join(downloadDir, 'stt-runtime.zip');

    this.setStatus({ state: 'downloading', message: 'Downloading STT runtime...', progress: 0 });
    await downloadFile(this.config.runtimeUrl, archivePath, (progress) => {
      this.setStatus({
        state: 'downloading',
        message: 'Downloading STT runtime...',
        progress
      });
    });

    await extractZip(archivePath, runtimeDir);
    await fsPromises.unlink(archivePath);

    await fsPromises.writeFile(versionPath, this.config.runtimeVersion, 'utf-8');

    if (!fs.existsSync(runtimePath)) {
      this.setStatus({ state: 'error', message: 'STT runtime install failed.' });
      return '';
    }

    return runtimePath;
  }

  private getSttRootDir() {
    return path.join(app.getPath('userData'), 'stt');
  }

  private getRuntimeDir() {
    return path.join(this.getSttRootDir(), 'runtime');
  }

  private getModelDir() {
    return path.join(this.getSttRootDir(), 'models');
  }

  private runtimeVersionMatches(versionPath: string) {
    if (!fs.existsSync(versionPath)) {
      return false;
    }

    try {
      const current = fs.readFileSync(versionPath, 'utf-8').trim();
      return current === this.config.runtimeVersion;
    } catch {
      return false;
    }
  }

  private setStatus(status: SttStatus) {
    this.status = status;
    this.emit('status', status);
  }
}

async function waitForServer(host: string, port: number, timeoutMs: number) {
  const started = Date.now();
  const urls = [
    `http://${host}:${port}/health`,
    `http://${host}:${port}/v1/models`,
    `http://${host}:${port}/`
  ];

  while (Date.now() - started < timeoutMs) {
    for (const url of urls) {
      const ok = await pingUrl(url);
      if (ok) {
        return true;
      }
    }
    await delay(500);
  }

  return false;
}

function pingUrl(url: string) {
  return new Promise<boolean>((resolve) => {
    const client = url.startsWith('https') ? https : http;
  const req = client.get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (progress: number) => void,
  redirects = 0
) {
  if (redirects > 5) {
    throw new Error('Too many redirects');
  }

  await new Promise<void>((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadFile(res.headers.location, dest, onProgress, redirects + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download failed (${res.statusCode ?? 'unknown'})`));
        return;
      }

      const total = Number(res.headers['content-length'] ?? 0);
      let downloaded = 0;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total && onProgress) {
          onProgress(downloaded / total);
        }
      });

      const fileStream = fs.createWriteStream(dest);
      pipeline(res, fileStream)
        .then(() => resolve())
        .catch(reject);
    });

    req.on('error', reject);
  });
}

async function extractZip(archivePath: string, destDir: string) {
  await new Promise<void>((resolve, reject) => {
    const command = `Expand-Archive -Path "${archivePath}" -DestinationPath "${destDir}" -Force`;
    const child = spawn('powershell', ['-Command', command], {
      windowsHide: true,
      stdio: 'ignore'
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Extract failed'));
      }
    });
  });
}
