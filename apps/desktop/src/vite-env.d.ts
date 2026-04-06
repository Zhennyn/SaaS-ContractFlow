/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_LICENSE_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    contractFlowDesktop?: {
      getMachineId: () => string;
      getVersion: () => Promise<string>;
      importLicenseFile: () => Promise<{ filePath: string; content: string } | null>;
    };
  }
}

export {};
