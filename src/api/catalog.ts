import { api } from "./client";
import type {
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

/** Register an open catalog entry through the authenticated BFF proxy. */
export async function registerCatalogServer(
  catalogId: string,
): Promise<CatalogServerRegisterResponse> {
  return api.post<CatalogServerRegisterResponse>(
    `/v1/catalog/${encodeURIComponent(catalogId)}/register`,
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
