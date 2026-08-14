import pkg from "./package.json";
import openapiSpec from "./openapi.json";

// Shared `define` block for vite.config.ts and vitest.config.ts — exposes the
// UI's own package version and the ContextForge API version it was generated
// against to the client bundle (see Header.tsx).
export const versionDefines = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __SUPPORTED_API_VERSION__: JSON.stringify(openapiSpec.info.version),
};
