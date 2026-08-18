// Location: ./client/server/src/plugins/static.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Serves the SPA build (`npm run build` from repo root -> server/public/)
// and owns the SPA-fallback 404: any GET that isn't a real static asset or an
// already-registered API/auth/SSE route gets the app shell, so client-side
// routing survives a hard refresh on a deep link (/app/login, /app/tools, ...).
// Registered with fastify-plugin so both the `sendFile` decorator and the
// not-found handler apply at the true root, not just this plugin's own
// encapsulated context — routes/app.ts's GET / relies on `sendFile` too.
//
// The auth-aware '/' redirect itself lives in routes/app.ts, not here: this
// plugin's fallback always serves index.html unconditionally for anything
// under /app/*, deferring to the client router's own AuthGuard.

import path from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { config } from "../config.js";

const DEFAULT_PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../public");
const PUBLIC_DIR = config.publicDir ?? DEFAULT_PUBLIC_DIR;

// The one place both the cache-header check below and the 404 handler's
// asset allowlist agree on what "an asset" is — keep them pointed at the
// same name so they can't drift, and keep it in sync with vite.config.ts's
// outDir contents and the root public/ dir it copies verbatim.
const ASSETS_DIR_NAME = "assets";
const ASSETS_URL_PREFIX = `/${ASSETS_DIR_NAME}/`;
// Prefix, not substring: PUBLIC_DIR is deploy-configurable (PUBLIC_DIR env
// var), so a bare `pathName.includes("/assets/")` would false-positive on
// index.html for any deploy path with an "assets" *ancestor* directory
// (e.g. PUBLIC_DIR=/srv/assets/server/public) — long-caching the SPA shell
// itself instead of only PUBLIC_DIR/assets/*.
const ASSETS_FS_PREFIX = path.join(PUBLIC_DIR, ASSETS_DIR_NAME) + path.sep;

export default fp(
  async function staticPlugin(fastify: FastifyInstance) {
    await fastify.register(fastifyStatic, {
      root: PUBLIC_DIR,
      prefix: "/",
      index: false, // '/' is handled explicitly by routes/app.ts, for the auth check
      // Only /assets/* is content-hashed by Vite, so only it gets long-cached.
      setHeaders(reply, pathName) {
        if (pathName.startsWith(ASSETS_FS_PREFIX)) {
          reply.header("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    });

    fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
      const pathname = request.url.split("?")[0] ?? request.url;
      // Allowlist known static-asset paths instead of guessing from a
      // trailing extension — a trailing-dot heuristic (e.g. "has a file
      // extension") wrongly 404s client routes like
      // /app/reset-password/:token when the token itself contains a dot.
      // Anything under these prefixes that reaches here is a genuinely
      // missing build artifact; everything else is a client-router path and
      // gets the SPA shell.
      const isKnownAssetPath =
        pathname.startsWith(ASSETS_URL_PREFIX) || pathname === "/favicon.ico";

      if (
        request.method !== "GET" ||
        pathname.startsWith("/api/") ||
        pathname.startsWith("/auth/") ||
        isKnownAssetPath
      ) {
        return reply.code(404).send({
          message: `Route ${request.method}:${request.url} not found`,
          error: "Not Found",
          statusCode: 404,
        });
      }
      return reply.sendFile("index.html");
    });
  },
  { name: "staticPlugin" },
);
