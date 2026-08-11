import { defineConfig } from "orval";

/**
 * The ContextForge (FastAPI) spec registers every route twice — once without a
 * trailing slash (`/v1/tags`) and once with (`/v1/tags/`). Both variants get the
 * same generated TypeScript name (e.g. `ListTagsV1TagsGetParams`), so orval emits
 * the same type into the same file twice and tsc fails with TS2300 "Duplicate
 * identifier". Drop the redundant trailing-slash path whenever its slashless twin
 * exists, before orval generates anything.
 */
const dedupeTrailingSlashPaths = (spec: any) => {
  const paths = spec.paths ?? {};
  for (const path of Object.keys(paths)) {
    if (path.length > 1 && path.endsWith("/") && paths[path.slice(0, -1)]) {
      delete paths[path];
    }
  }
  return spec;
};

export default defineConfig({
  contextforge: {
    input: {
      target: "./openapi.json",
      override: { transformer: dedupeTrailingSlashPaths },
    },
    output: {
      schemas: {
        path: "./src/generated/types/",
      },
      target: "./src/generated/types/",
      clean: true,
      client: "fetch",
      override: {
        useTypeOverInterfaces: true,
      },
    },
    hooks: {
      "afterAllFilesWrite": "prettier src/generated --write"
    }
  },
});
