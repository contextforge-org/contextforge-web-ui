// Location: ./client/server/src/lib/request-logging.ts
// Copyright contributors to the MCP-CONTEXT-FORGE project
// SPDX-License-Identifier: Apache-2.0
//
// Password-reset tokens are bearer credentials. They appear in both the SPA
// route and the BFF API route, so Fastify's automatic request logger must not
// serialize either URL into application logs.

import { LogController } from "fastify";

const SENSITIVE_PASSWORD_RESET_PREFIXES = [
  "/app/reset-password/",
  "/api/auth/email/reset-password/",
] as const;

export function isSensitivePasswordResetUrl(url: string): boolean {
  return SENSITIVE_PASSWORD_RESET_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export function createRequestLogController(): LogController {
  return new LogController({
    disableRequestLogging: (request) => isSensitivePasswordResetUrl(request.url),
  });
}
