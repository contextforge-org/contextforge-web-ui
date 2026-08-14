import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import pkg from "./package.json";
import openapiSpec from "./openapi.json";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Exposes the UI's own package version and the ContextForge API version
  // it was generated against to the client bundle (see Header.tsx).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __SUPPORTED_API_VERSION__: JSON.stringify(openapiSpec.info.version),
  },

  css: {
    postcss: {
      plugins: [],
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  base: "/",

  build: {
    // BFF (server/) serves this directory as static files — see
    // server/src/plugins/static.ts.
    outDir: "server/public",
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      external: (id) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(id),
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("/react-is/") ||
            id.includes("/react-remove-scroll") ||
            id.includes("/react-style-singleton") ||
            id.includes("/use-callback-ref") ||
            id.includes("/use-sidecar") ||
            id.includes("react-intl") ||
            id.includes("@formatjs") ||
            id.includes("/sonner/")
          ) return "vendor-react";
          if (id.includes("@radix-ui") || id.includes("radix-ui")) return "vendor-radix";
          if (id.includes("lucide-react")) return "vendor-lucide";
          return "vendor";
        },
      },
    },
  },
});
