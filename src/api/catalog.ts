import { api } from "./client";
import { serversApi } from "./servers";
import type {
  CatalogServerRegisterBody,
  CatalogServerRegisterResponse,
  GatewayRead,
  GatewayTestRequest,
  GatewayTestResponse,
} from "@/generated/types";

export interface GatewayImpactPreview {
  gatewayId: string;
  servers: Array<{ id: string; name: string }>;
}

export type CatalogGatewayDeleteResponse = GatewayRead | { status?: string; message?: string };

/** Register a catalog entry through the authenticated BFF proxy. */
export async function registerCatalogServer(
  catalogId: string,
  body?: CatalogServerRegisterBody,
): Promise<CatalogServerRegisterResponse> {
  return api.post<CatalogServerRegisterResponse>(
    `/v1/catalog/${encodeURIComponent(catalogId)}/register`,
    body,
  );
}

/** Delete gateway selected by caller-visible catalog registration state. */
export function disconnectCatalogGateway(gatewayId: string) {
  return api.deleteWithMeta<CatalogGatewayDeleteResponse>(
    `/v1/gateways/${encodeURIComponent(gatewayId)}`,
  );
}

/** Test the catalog server URL using stored credentials when backend has them. */
export function testCatalogServer(url: string): Promise<GatewayTestResponse> {
  const request: GatewayTestRequest = {
    method: "GET",
    baseUrl: url,
    path: "",
    // Streamable HTTP MCP servers require this for a GET connection check.
    headers: { Accept: "text/event-stream" },
  };
  return api.post<GatewayTestResponse>("/v1/mcp-servers/test", request);
}

/** Preview caller-visible virtual servers affected by disconnecting a gateway. */
export function getGatewayImpactPreview(gatewayId: string): Promise<GatewayImpactPreview> {
  return api.get<GatewayImpactPreview>(
    `/v1/gateways/${encodeURIComponent(gatewayId)}/impact-preview`,
  );
}

/**
 * Outcome of {@link runOAuthAuthorization}. "cancelled" and "authorized" (even with
 * no tools found) are both non-error exit states per the catalog OAuth add flow: the
 * gateway already exists and is configured, so neither should be reported as a failure.
 */
export type OAuthAuthorizationOutcome =
  | { status: "authorized"; toolsMessage?: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/**
 * Runs the popup-authorize -> activate -> fetch-tools sequence for an existing OAuth
 * gateway. Shared between the catalog OAuth add dialog (right after registration) and
 * the catalog card's standalone "Authorize" action (for a gateway registered earlier
 * whose popup was closed before completing), so both call sites behave identically.
 */
export async function runOAuthAuthorization(gatewayId: string): Promise<OAuthAuthorizationOutcome> {
  try {
    await serversApi.triggerOAuthAuthorization(gatewayId);
  } catch (error) {
    if (error instanceof Error && error.message === "OAuth authorization was cancelled") {
      return { status: "cancelled" };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "OAuth authorization failed.",
    };
  }

  try {
    // Best-effort, matching the manual connect-form flow: activation failing must not
    // fail the overall OAuth result, since the user can activate manually later.
    await serversApi.toggleEnabled(gatewayId, true);
  } catch {
    // Intentionally ignored.
  }

  try {
    const fetchResult = await serversApi.fetchToolsAfterOAuth(gatewayId);
    return { status: "authorized", toolsMessage: fetchResult.message };
  } catch {
    // Authorized but tool discovery failed - still a non-error exit state.
    return { status: "authorized" };
  }
}
