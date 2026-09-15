import { api } from "./client";
import type {
  CatalogServer,
  CatalogServerRegisterBody,
  CatalogServerRegisterResponse,
  GatewayRead,
  GatewayTestRequest,
  GatewayTestResponse,
} from "@/generated/types";

/**
 * Public OAuth metadata returned by the catalog API.
 *
 * This remains hand-written until the frontend OpenAPI snapshot includes the
 * backend's CatalogOAuthMetadata schema. Client credentials are intentionally
 * absent: they are deployment-specific secrets and must never round-trip.
 */
export interface CatalogOAuthMetadata {
  issuer?: string | null;
  authorization_url?: string | null;
  token_url?: string | null;
  scopes: string[];
  supports_dcr?: boolean;
  resource?: string | null;
}

/** Catalog server enriched with the public OAuth metadata returned by the API. */
export type CatalogServerWithOAuthMetadata = CatalogServer & {
  oauth?: CatalogOAuthMetadata | null;
};

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
  oauth_credentials: CatalogOAuthCredentials; // pragma: allowlist secret
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
