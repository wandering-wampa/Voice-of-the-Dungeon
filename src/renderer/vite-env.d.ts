/// <reference types="vite/client" />

declare global {
  interface Window {
    vod: {
      ping: (message: string) => Promise<string>;
      stt: {
        transcribe: (audioBuffer: ArrayBuffer) => Promise<{ text: string; error?: string }>;
        getStatus: () => Promise<{ state: string; message?: string; progress?: number }>;
        ensureReady: () => Promise<{ state: string; message?: string; progress?: number }>;
        onStatus: (
          callback: (status: { state: string; message?: string; progress?: number }) => void
        ) => () => void;
      };
    };
  }
}

export {};
