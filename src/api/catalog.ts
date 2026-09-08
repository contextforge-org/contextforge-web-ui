import { api } from "./client";
import type {
  CatalogServerRegisterBody,
  CatalogServerRegisterResponse,
  GatewayRead,
  GatewayTestRequest,
  GatewayTestResponse,
} from "@/generated/types";

/** Temporary handwritten contract until #6588 reaches generated OpenAPI types. */
export interface CatalogOAuthCredentials {
  grant_type: "authorization_code";
  issuer: string;
  client_id: string;
  client_secret: string; // pragma: allowlist secret
  authorization_url: string;
  token_url: string;
  scopes: string[];
}

export type CatalogOAuthRegisterBody = CatalogServerRegisterBody & {
  oauth_credentials: CatalogOAuthCredentials;
};

export interface OAuthUserTokenStatus {
  status: "valid" | "near_expiry" | "expired" | "missing";
  authorized: boolean;
  scopes?: string[];
  expires_at?: string | null;
  updated_at?: string | null;
}

export interface OAuthGatewayStatus {
  oauth_enabled: boolean;
  grant_type?: string;
  user_token_status?: OAuthUserTokenStatus;
}

export type OAuthGatewayStatusMap = Record<string, OAuthGatewayStatus>;

export interface GatewayImpactPreview {
  gatewayId: string;
  servers: Array<{ id: string; name: string }>;
}

export type CatalogGatewayDeleteResponse = GatewayRead | { status?: string; message?: string };

/** Register a catalog entry through the authenticated BFF proxy. */
export async function registerCatalogServer(
  catalogId: string,
  body?: CatalogServerRegisterBody | CatalogOAuthRegisterBody,
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
