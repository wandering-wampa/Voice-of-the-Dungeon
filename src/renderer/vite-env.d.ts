/// <reference types="vite/client" />

declare global {
  interface Window {
    vod: {
      ping: (message: string) => Promise<string>;
    };
  }
}

export {};
