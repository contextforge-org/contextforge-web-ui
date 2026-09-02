// Location: ./client/server/src/plugins/vite-dev-proxy.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Dev-only substitute for plugins/static.ts: reverse-proxies everything not
// matched by the BFF's own routes (SPA shell, JS/CSS modules, HMR) to a
// separately-running `npm run dev` Vite dev server (config.viteDevServerUrl),
// so the browser only ever talks to the BFF's own origin instead of Vite's —
// avoiding the Origin mismatch a directly-visited Vite dev server would hit
// against origin-guard.ts. Registered in index.ts instead of staticPlugin
// when VITE_DEV_SERVER_URL is set; never active in production.
//
// /api/*, /auth/*, /healthz etc. are unaffected: those are static-prefixed
// routes registered elsewhere, which find-my-way always prefers over this
// plugin's root wildcard regardless of registration order. Bare `/` is
// deliberately excluded from `routes` below (the plugin's default also
// registers that exact path) since routes/app.ts's own GET / owns the
// auth-aware redirect — registering both would collide as duplicate routes.
//
// websocket: true proxies any WS upgrade that does land on this origin, but
// Vite's HMR client connects browser->Vite directly on Vite's own port by
// default — this is a safety net, not the primary HMR path.

import httpProxy from "@fastify/http-proxy";
import type { FastifyInstance } from "fastify";

import { config } from "../config.js";

export default async function viteDevProxyPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(httpProxy, {
    upstream: config.viteDevServerUrl!,
    prefix: "/",
    routes: ["/*"],
    websocket: true,
  });
}
