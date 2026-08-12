// Location: ./client/server/src/routes/sse/proxy-sse.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Generic SSE proxy route factory. Concrete registrations live in routes.ts.
// Hand-rolled (reply.hijack() + a dedicated undici pool) rather than
// @fastify/reply-from — see "Why hand-rolled ... for SSE" in
// agent-output/bff-proxy-and-sse-plan.md: SSE needs a pool with no
// headers/body timeouts, which must not leak into the shared catch-all pool,
// and a first-class AbortController to register for cleanup.
//
// CSRF is intentionally not applied here: EventSource can't set custom
// headers, so double-submit CSRF doesn't work for SSE. That matters because
// upstreamMethod can be POST (see resources/subscribe) — an exact
// Origin-header check below (lib/origin-guard.ts) is the substitute for the
// CSRF double-submit, same as login.ts's guard. SameSite=Lax on the session
// cookie is not sufficient by itself: it's still sent on cross-site
// top-level GET navigations, and the browser-facing verb here is always GET
// even when the upstream call it triggers is a state-changing POST.

import { pipeline } from "node:stream/promises";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import { getSession } from "../../lib/session-store.js";
import { sseUpstreamPool } from "../../lib/upstream-http-client.js";
import { writeSseHeaders } from "../../lib/sse-headers.js";
import { upstreamAuthHeader } from "../../lib/upstream-auth.js";
import { isForbiddenCrossOrigin } from "../../lib/origin-guard.js";
import { register, unregister } from "./registry.js";

export interface SseProxyRouteOptions {
  /** Browser-facing path, e.g. '/api/resources/subscribe'. Always GET (EventSource). */
  browserPath: string;
  /** Upstream FastAPI path, e.g. '/resources/subscribe'. */
  upstreamPath: string;
  /** Upstream verb — independent of the browser's GET, since e.g. /resources/subscribe is POST-only upstream. */
  upstreamMethod: "GET" | "POST";
  /** Optional upstream request body builder, for POST upstreams that take subscription params. */
  buildUpstreamBody?: (request: FastifyRequest) => unknown;
}

export function registerSseProxyRoute(fastify: FastifyInstance, opts: SseProxyRouteOptions): void {
  fastify.get(
    opts.browserPath,
    { preHandler: [fastify.sessionAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (isForbiddenCrossOrigin(request)) {
        return reply.code(403).send({ error: "cross_site_request_forbidden" });
      }

      const session = request.session!;
      const controller = new AbortController();

      const body = opts.buildUpstreamBody
        ? JSON.stringify(opts.buildUpstreamBody(request))
        : undefined;

      let upstream;
      try {
        upstream = await sseUpstreamPool.request({
          path: opts.upstreamPath,
          method: opts.upstreamMethod,
          headers: {
            ...upstreamAuthHeader(session.bearerToken),
            accept: "text/event-stream",
            ...(body ? { "content-type": "application/json" } : {}),
          },
          body,
          signal: controller.signal,
        });
      } catch (err) {
        request.log.error({ err, path: opts.upstreamPath }, "sse upstream connect failed");
        return reply.code(502).send({ error: "upstream_unavailable" });
      }

      if (upstream.statusCode >= 400) {
        const detail = await upstream.body.text().catch(() => "");
        return reply.code(upstream.statusCode).send({ error: "upstream_error", detail });
      }

      reply.hijack();
      writeSseHeaders(reply.raw);
      register(session.sessionId, controller);

      let closed = false;
      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(recheckTimer);
        unregister(session.sessionId, controller);
        controller.abort();
      };

      request.raw.on("close", cleanup);

      // Option A (bounded-staleness): re-check the Redis session periodically
      // and abort if it's gone, in case pub/sub revocation (Option B, see
      // revocation-subscriber.ts) is missed for any reason. Jittered ±10% so
      // many connections opened around the same time don't all poll Redis
      // in lockstep.
      const jitter = 1 + (Math.random() * 0.2 - 0.1);
      const recheckTimer = setInterval(
        () => {
          getSession(fastify.redis, session.sessionId)
            .then((record) => {
              if (!record) cleanup();
            })
            .catch((err) => request.log.warn({ err }, "sse session recheck failed"));
        },
        config.sseSessionRecheckSeconds * 1000 * jitter,
      );

      try {
        // pipeline() handles backpressure and tears down both streams on
        // error/abort — no manual write()/drain() loop needed.
        await pipeline(upstream.body, reply.raw, { signal: controller.signal });
      } catch (err) {
        if (!closed) request.log.debug({ err }, "sse stream ended");
      } finally {
        cleanup();
      }
    },
  );
}
