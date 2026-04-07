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
      notify: (payload: { title: string; body: string }) => Promise<boolean>;
      sendEmailBatch: (
        smtpConfig: { host: string; port: number; secure: boolean; user: string; password: string },
        messages: Array<{ to: string; subject: string; html: string }>
      ) => Promise<{ ok: boolean; error?: string; results?: Array<{ to: string; ok: boolean; error?: string }> }>;
    };
  }
}

export {};
