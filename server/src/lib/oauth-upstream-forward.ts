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
//
// htmlizeOAuthPopupErrors turns the JSON errors the BFF itself can produce on
// these two routes (401 from sessionAuth, 403 from isForbiddenCrossOrigin,
// 502 from the fetch failure below) into the same postMessage-and-close HTML
// shape mcpgateway's own callback page uses on success. Without this, those
// three failures leave the popup rendering raw JSON: nothing posts a
// message, so triggerOAuthAuthorization (src/api/servers.ts) never resolves
// or rejects until the user closes the popup by hand, at which point it
// reports "cancelled" -- which isn't what happened. Registered as this
// route's `onSend` hook, which still runs (and can still rewrite the
// payload) even though sessionAuth's preHandler is what called reply.send().
// Upstream (mcpgateway) error responses forwarded as-is are untouched here --
// they're whatever status/body mcpgateway itself chose to send, not one of
// these three BFF-generated cases.

import type { FastifyReply, FastifyRequest } from "fastify";

const OAUTH_POPUP_ERROR_MESSAGES: Record<number, { error: string; errorDescription: string }> = {
  401: {
    error: "unauthenticated",
    errorDescription: "Your session has expired. Please sign in again and retry.",
  },
  403: {
    error: "cross_site_request_forbidden",
    errorDescription: "This request could not be verified. Please retry from the original page.",
  },
  502: {
    error: "upstream_unavailable",
    errorDescription: "The OAuth provider could not be reached. Please try again.",
  },
};

function oauthPopupErrorHtml(error: string, errorDescription: string): string {
  const payload = JSON.stringify({
    type: "oauth_callback",
    status: "error",
    error,
    errorDescription,
  });
  return `<!DOCTYPE html><html><body><script>
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(${payload}, "*");
    }
    window.close();
  </script></body></html>`;
}

export async function htmlizeOAuthPopupErrors(
  _request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
): Promise<unknown> {
  const mapped = OAUTH_POPUP_ERROR_MESSAGES[reply.statusCode];
  if (!mapped) return payload;

  reply.header("content-type", "text/html; charset=utf-8");
  return oauthPopupErrorHtml(mapped.error, mapped.errorDescription);
}

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

  let body: string;
  try {
    body = await upstreamResponse.text();
  } catch (err) {
    // Headers already arrived (2xx/3xx/4xx status committed above), but the
    // connection dropped mid-body -- e.g. the IdP redirect's response closing
    // early. Without this, the thrown error would escape this function
    // entirely and Fastify would emit a bare 500 with no body: a worse dead
    // end for the popup than the 502 the pre-fetch failure above already
    // produces, and one htmlizeOAuthPopupErrors can't help with since it only
    // runs on a normal reply.send() completion. Clear the Location header set
    // above so a stale redirect target doesn't ride along on a 502.
    reply.removeHeader("location");
    request.log.error(
      { errorType: err instanceof Error ? err.name : typeof err },
      `upstream ${logLabel} response body read failed`,
    );
    return reply.code(502).send({ error: "upstream_unavailable" });
  }

  return reply.code(upstreamResponse.status).send(body || undefined);
}
