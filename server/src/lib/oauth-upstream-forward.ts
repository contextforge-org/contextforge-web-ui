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

import { stripOAuthInboundHeaders } from "./inbound-headers.js";

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

// mcpgateway's callback page only posts the result and closes the popup when
// `window.opener` is set. A provider that sends Cross-Origin-Opener-Policy
// (e.g. Stripe) severs it, leaving the popup stranded.
//  - Success: the opener learns the outcome by polling token status
//    (src/api/servers.ts), so just close the orphaned window.
//  - Failure: nothing can be polled, so broadcast the error over a
//    same-origin BroadcastChannel, which survives the severed opener, then
//    close. The provider's `error`/`error_description` redirect params are
//    used when present; a failure further in (e.g. the token exchange) falls
//    back to a generic message. Keep the channel name in sync with
//    src/api/servers.ts.
const CLOSE_SEVERED_POPUP_SCRIPT =
  "<script>if(!window.opener){setTimeout(function(){window.close()},1500)}</script>";
const BROADCAST_SEVERED_POPUP_ERROR_SCRIPT = `<script>if(!window.opener){try{
  var p=new URLSearchParams(location.search);
  var c=new BroadcastChannel("contextforge_oauth_callback");
  c.postMessage({type:"oauth_callback",status:"error",
    error:(p.get("error")||"authorization_failed").slice(0,200),
    errorDescription:(p.get("error_description")||"Authorization failed. Please try again.").slice(0,500)});
  c.close();
}catch(e){}setTimeout(function(){window.close()},1500)}</script>`;

export async function closeSeveredOAuthPopup(
  _request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
): Promise<unknown> {
  const isHtml = String(reply.getHeader("content-type") ?? "").includes("text/html");
  if (!isHtml || typeof payload !== "string") return payload;
  let script: string;
  if (reply.statusCode === 200) script = CLOSE_SEVERED_POPUP_SCRIPT;
  else if (reply.statusCode >= 400) script = BROADCAST_SEVERED_POPUP_ERROR_SCRIPT;
  else return payload;
  return payload.includes("</body>")
    ? payload.replace("</body>", `${script}</body>`)
    : payload + script;
}

interface ForwardOAuthGetOptions {
  /** Extra headers merged into the upstream request (e.g. the injected bearer token). */
  headers?: Record<string, string>;
  /**
   * Relay the caller's non-sensitive inbound headers. Only the session-guarded
   * authorize hop needs this (external proxy identity header); the callback
   * hop is authenticated by its HMAC state and must not relay caller headers.
   */
  forwardInboundHeaders?: boolean;
  timeoutMs: number;
  /** Included in the network-failure log line, e.g. "OAuth authorize". */
  logLabel: string;
}

export async function forwardOAuthGet(
  request: FastifyRequest,
  reply: FastifyReply,
  upstreamUrl: string,
  { headers = {}, forwardInboundHeaders = false, timeoutMs, logLabel }: ForwardOAuthGetOptions,
): Promise<FastifyReply> {
  // Keep the inbound headers the /api/* proxy keeps, minus the ones a bare
  // fetch() must own (Host, hop-by-hop framing, conditional request headers).
  // In trusted-proxy deployments mcpgateway authenticates /oauth/authorize
  // from the external proxy's identity header, not from the injected bearer,
  // so building the upstream request from scratch on that hop would 401 the
  // popup. That header is client-supplied: forwarding it is only safe because
  // those deployments require the external proxy to overwrite it
  // (TRUST_PROXY_AUTH); the BFF does not validate it. Only the authorize hop
  // opts in -- the callback hop has no session and must not relay caller
  // headers. BFF-owned values below are merged last and always win.
  const forwardedHeaders: Record<string, string> = {};
  if (forwardInboundHeaders) {
    const inbound = stripOAuthInboundHeaders(request.headers);
    for (const [key, value] of Object.entries(inbound)) {
      if (typeof value === "string") {
        forwardedHeaders[key] = value;
      } else if (Array.isArray(value)) {
        forwardedHeaders[key] = value.join(", ");
      }
    }
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        ...forwardedHeaders,
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
