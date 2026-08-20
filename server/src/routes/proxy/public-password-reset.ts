// Location: ./client/server/src/routes/proxy/public-password-reset.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Narrow unauthenticated proxy for ContextForge's password-recovery API.
// These routes cannot use the protected /api/* catch-all: requesting a reset
// link and validating/completing a reset token must work before login.
//
// Keep this allowlist explicit. A generic unauthenticated /api/auth/* proxy
// would expose protected email-auth administration routes without the BFF's
// session and bearer-token boundary.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.js";
import { setNoStore } from "../../lib/no-store.js";
import { isForbiddenCrossOrigin } from "../../lib/origin-guard.js";

const UPSTREAM_PREFIX = "/auth/email";

type PasswordResetOperation = "request" | "validate" | "complete";

interface ResetTokenParams {
  token: string;
}

function upstreamHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    // Preserve real client data for upstream rate limiting and audit events.
    "x-forwarded-for": request.ip,
    "x-real-ip": request.ip,
  };

  const userAgent = request.headers["user-agent"];
  if (typeof userAgent === "string") headers["user-agent"] = userAgent;

  return headers;
}

async function forwardPublicRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  upstreamPath: string,
  operation: PasswordResetOperation,
): Promise<FastifyReply> {
  setNoStore(reply);

  let upstreamResponse: Response;
  let responseBody: string;
  try {
    upstreamResponse = await fetch(`${config.contextforgeUrl}${upstreamPath}`, {
      method: request.method,
      headers: upstreamHeaders(request),
      body: request.method === "GET" ? undefined : JSON.stringify(request.body),
      signal: AbortSignal.timeout(config.passwordResetRequestTimeoutMs),
    });
    responseBody = await upstreamResponse.text();
  } catch (err) {
    request.log.error(
      { errorType: err instanceof Error ? err.name : typeof err, operation },
      "upstream password-reset request failed",
    );
    return reply.code(502).send({ error: "upstream_unavailable" });
  }

  // Forward only response metadata needed by the SPA. In particular, never
  // pass upstream Set-Cookie or Location headers through this public route.
  const contentType = upstreamResponse.headers.get("content-type");
  if (contentType) reply.header("content-type", contentType);
  const retryAfter = upstreamResponse.headers.get("retry-after");
  if (retryAfter) reply.header("retry-after", retryAfter);

  if (!responseBody) return reply.code(upstreamResponse.status).send();

  if (contentType?.toLowerCase().includes("json")) {
    try {
      return reply.code(upstreamResponse.status).send(JSON.parse(responseBody));
    } catch (err) {
      request.log.error(
        { errorType: err instanceof Error ? err.name : typeof err, operation },
        "upstream password-reset returned invalid JSON",
      );
      return reply.code(502).send({ error: "upstream_invalid_response" });
    }
  }

  return reply.code(upstreamResponse.status).send(responseBody);
}

function rejectCrossOriginMutation(
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply | undefined {
  if (!isForbiddenCrossOrigin(request)) return undefined;

  setNoStore(reply);
  return reply.code(403).send({ error: "cross_site_request_forbidden" });
}

export default async function publicPasswordResetRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/api/auth/email/forgot-password",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const rejection = rejectCrossOriginMutation(request, reply);
      if (rejection) return rejection;

      return forwardPublicRequest(request, reply, `${UPSTREAM_PREFIX}/forgot-password`, "request");
    },
  );

  fastify.get<{ Params: ResetTokenParams }>(
    "/api/auth/email/reset-password/:token",
    async (request: FastifyRequest<{ Params: ResetTokenParams }>, reply: FastifyReply) =>
      forwardPublicRequest(
        request,
        reply,
        `${UPSTREAM_PREFIX}/reset-password/${encodeURIComponent(request.params.token)}`,
        "validate",
      ),
  );

  fastify.post<{ Params: ResetTokenParams }>(
    "/api/auth/email/reset-password/:token",
    async (request: FastifyRequest<{ Params: ResetTokenParams }>, reply: FastifyReply) => {
      const rejection = rejectCrossOriginMutation(request, reply);
      if (rejection) return rejection;

      return forwardPublicRequest(
        request,
        reply,
        `${UPSTREAM_PREFIX}/reset-password/${encodeURIComponent(request.params.token)}`,
        "complete",
      );
    },
  );
}
