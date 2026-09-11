import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { versionDefines } from "./build-constants";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  define: versionDefines,

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
          // Anchored to the package root: a bare `/react-dom/` substring also
          // matches @floating-ui/react-dom, which drags @floating-ui/dom in
          // from `vendor` and makes vendor <-> vendor-react circular. Keep this
          // chunk a leaf — react-adjacent packages (react-intl, @formatjs,
          // sonner, react-remove-scroll) belong in `vendor`, since they import
          // helpers that live there.
          if (/node_modules\/(react|react-dom|scheduler|react-is)\//.test(id))
            return "vendor-react";
          // recharts and its d3/redux tree, kept out of `vendor` so charts do
          // not double the chunk every page loads. After `vendor-react` so
          // react-is stays in that leaf.
          if (
            /node_modules\/(recharts|victory-vendor|d3-[\w-]+|internmap|robust-predicates|delaunator|@reduxjs\/toolkit|react-redux|redux|redux-thunk|immer|reselect|es-toolkit|decimal\.js-light|eventemitter3|use-sync-external-store)\//.test(
              id,
            )
          )
            return "vendor-charts";
          if (id.includes("@radix-ui") || id.includes("radix-ui")) return "vendor-radix";
          if (id.includes("lucide-react")) return "vendor-lucide";
          return "vendor";
        },
      },
    },
  },
});
