/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_TOOL_PREVIEW?: string;
}

// Injected by vite.config.ts `define` from package.json's version field.
declare const __APP_VERSION__: string;
// Injected by vite.config.ts `define` from openapi.json's info.version field.
declare const __SUPPORTED_API_VERSION__: string;
