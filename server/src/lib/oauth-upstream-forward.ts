// Location: ./client/server/src/lib/oauth-upstream-forward.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Shared GET-and-forward for the two OAuth popup proxy routes
// (routes/proxy/oauth-authorize.ts, oauth-callback.ts): fetch upstream with
// a timeout, forward status/Location/Content-Type/body, 502 on network
// failure. Kept in one place so a fix to one hop's forwarding behavior
// (e.g. a missing header, the empty-body edge case) can't silently drift
// out of sync with the other's -- same rationale as catch-all.ts centralizing
// rewriteUpstreamLocation/stripInboundHeaders for the /api/* proxy.
//
// Location is forwarded whenever present regardless of caller: harmless for
// oauth-callback.ts (mcpgateway's GET /oauth/callback never redirects), and
// it's the whole point for oauth-authorize.ts (the 302 to the OAuth
// provider). Never rewritten -- unlike catch-all's rewriteUpstreamLocation,
// which only rewrites Location values pointing back at config.contextforgeUrl
// -- because both hops here only ever redirect to an external OAuth
// provider's own absolute URL.

import type { FastifyReply, FastifyRequest } from "fastify";

interface ForwardOAuthGetOptions {
  /** Extra headers merged into the upstream request (e.g. the injected bearer token). */
  headers?: Record<string, string>;
  timeoutMs: number;
  /** Included in the network-failure log line, e.g. "OAuth authorize". */
  logLabel: string;
}

export async function forwardOAuthGet(
  request: FastifyRequest,
  reply: FastifyReply,
  upstreamUrl: string,
  { headers = {}, timeoutMs, logLabel }: ForwardOAuthGetOptions,
): Promise<FastifyReply> {
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        accept: "text/html",
        // Preserve real client IP for upstream audit logging, same as catch-all.ts.
        "x-forwarded-for": request.ip,
        "x-real-ip": request.ip,
        ...headers,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    request.log.error(
      { errorType: err instanceof Error ? err.name : typeof err },
      `upstream ${logLabel} request failed`,
    );
    return reply.code(502).send({ error: "upstream_unavailable" });
  }

  const location = upstreamResponse.headers.get("location");
  if (location) reply.header("location", location);

  const contentType = upstreamResponse.headers.get("content-type");
  if (contentType) reply.header("content-type", contentType);

  const body = await upstreamResponse.text();
  return reply.code(upstreamResponse.status).send(body || undefined);
}
