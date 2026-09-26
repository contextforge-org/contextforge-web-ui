import { api, ApiError } from "./client";

export type OAuthTokenStatus = "valid" | "near_expiry" | "expired" | "missing" | "unknown";

export interface OAuthUserTokenStatus {
  status: OAuthTokenStatus;
  authorized: boolean;
  scopes?: string[];
  expires_at?: string | null;
  updated_at?: string | null;
}

export interface OAuthGatewayStatus {
  oauth_enabled: boolean;
  grant_type?: string;
  authorization_url?: string;
  message?: string;
  user_token_status?: OAuthUserTokenStatus;
}

export type OAuthGatewayStatusMap = Record<string, OAuthGatewayStatus>;

export interface OAuthStatusFailure {
  retryable: boolean;
  status?: number;
}

export interface OAuthStatusBatchResult {
  statuses: OAuthGatewayStatusMap;
  failures: Record<string, OAuthStatusFailure>;
}

const OAUTH_STATUS_MAX_IDS = 100;

export function normalizeGatewayIds(gatewayIds: string[]): string[] {
  return [...new Set(gatewayIds.map((id) => id.trim()).filter(Boolean))];
}

/** Fetch caller-scoped OAuth state, respecting the backend's 100-id batch cap. */
export async function getOAuthStatuses(
  gatewayIds: string[],
  signal?: AbortSignal,
): Promise<OAuthStatusBatchResult> {
  const ids = normalizeGatewayIds(gatewayIds);
  if (ids.length === 0) return { statuses: {}, failures: {} };

  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += OAUTH_STATUS_MAX_IDS) {
    batches.push(ids.slice(start, start + OAUTH_STATUS_MAX_IDS));
  }

  const settled = await Promise.allSettled(
    batches.map(async (batch) => {
      const params = new URLSearchParams();
      batch.forEach((id) => params.append("gateway_ids", id));
      const statuses = await api.get<OAuthGatewayStatusMap>(
        `/oauth/status?${params.toString()}`,
        undefined,
        signal,
      );
      return { batch, statuses };
    }),
  );

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const result: OAuthStatusBatchResult = { statuses: {}, failures: {} };
  settled.forEach((entry, index) => {
    const batch = batches[index];
    if (entry.status === "fulfilled") {
      Object.assign(result.statuses, entry.value.statuses);
      return;
    }

    const status = entry.reason instanceof ApiError ? entry.reason.status : undefined;
    const failure = { retryable: status !== 403, ...(status === undefined ? {} : { status }) };
    batch.forEach((id) => {
      result.failures[id] = failure;
    });
  });

  return result;
}
