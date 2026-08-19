import { mergeConfig, defineConfig } from "vite";

import baseConfig from "./vite.config";

// Alternate build target for a BFF-served SPA: outputs to server/public/
// with base '/', instead of vite.config.ts's default (dist/ with base
// '/static/app/', for FastAPI's static mount). Everything else — plugins,
// chunking, etc. — is inherited from the base config.
export default mergeConfig(
  baseConfig,
  defineConfig({
    base: "/",
    build: {
      outDir: "server/public",
      emptyOutDir: true,
    },
  }),
);
