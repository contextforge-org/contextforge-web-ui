import { api } from "@/api/client";
import type { CreateServerDetails } from "@/components/gateways/types";
import type { VirtualServer } from "@/types/server";
import type { GatewayHandshakeResponse, ServerHandshakeRequest } from "@/generated/types";

export interface CreateVirtualServerPayload {
  server: {
    name: string;
    description?: string;
    icon: string;
    tags: string[];
    associated_tools: string[];
    associated_resources: string[];
    associated_prompts: string[];
    associated_a2a_agents: string[];
    team_id: string | null;
    owner_email?: string;
    visibility: CreateServerDetails["visibility"];
    oauth_enabled: boolean;
    oauth_config?: Record<string, unknown>;
  };
  team_id: string | null;
  visibility: CreateServerDetails["visibility"];
}

export interface UpdateVirtualServerPayload {
  name: string;
  description: string;
  tags: string[];
  associated_tools?: string[];
  associated_resources?: string[];
  associated_prompts?: string[];
  team_id?: string;
  visibility: CreateServerDetails["visibility"];
  oauth_enabled: boolean;
}

export function buildCreateVirtualServerPayload(
  details: CreateServerDetails,
): CreateVirtualServerPayload {
  const teamId = details.visibility === "team" && details.teamId ? details.teamId : null;

  return {
    server: {
      name: details.name,
      description: details.description || undefined,
      icon: "",
      tags: details.tags ?? [],
      associated_tools: details.associatedTools ?? [],
      associated_resources: details.associatedResources ?? [],
      associated_prompts: details.associatedPrompts ?? [],
      associated_a2a_agents: [],
      team_id: teamId,
      visibility: details.visibility,
      oauth_enabled: details.oauthEnabled,
      oauth_config: details.oauthEnabled ? {} : undefined,
    },
    team_id: teamId,
    visibility: details.visibility,
  };
}

export function createVirtualServer(details: CreateServerDetails): Promise<VirtualServer> {
  return api.post<VirtualServer>("/v1/virtual-servers", buildCreateVirtualServerPayload(details));
}

export function deleteVirtualServer(id: string): Promise<void> {
  return api.delete<void>(`/v1/virtual-servers/${encodeURIComponent(id)}`);
}

export function setVirtualServerState(id: string, activate: boolean): Promise<VirtualServer> {
  return api.post<VirtualServer>(
    `/v1/virtual-servers/${encodeURIComponent(id)}/state?activate=${activate}`,
  );
}

export function buildUpdateVirtualServerPayload(
  details: CreateServerDetails,
): UpdateVirtualServerPayload {
  const payload: UpdateVirtualServerPayload = {
    name: details.name,
    description: details.description ?? "",
    tags: details.tags ?? [],
    visibility: details.visibility,
    oauth_enabled: details.oauthEnabled,
  };

  if (details.associatedTools !== undefined) {
    payload.associated_tools = details.associatedTools;
  }
  if (details.associatedResources !== undefined) {
    payload.associated_resources = details.associatedResources;
  }
  if (details.associatedPrompts !== undefined) {
    payload.associated_prompts = details.associatedPrompts;
  }
  if (details.visibility === "team" && details.teamId) {
    payload.team_id = details.teamId;
  }

  return payload;
}

export function updateVirtualServer(
  serverId: string,
  details: CreateServerDetails,
): Promise<VirtualServer> {
  return api.put<VirtualServer>(
    `/v1/virtual-servers/${encodeURIComponent(serverId)}`,
    buildUpdateVirtualServerPayload(details),
  );
}

/**
 * Replace a virtual server's tags.
 *
 * Sends a partial `PUT /v1/virtual-servers/{id}` carrying only `tags`; the server update
 * service preserves every other field (name, visibility, associated
 * tools/resources/prompts, ...) when it is omitted. Returns the updated server
 * so callers can patch their cache with the backend-normalized tags.
 */
export function updateVirtualServerTags(serverId: string, tags: string[]): Promise<VirtualServer> {
  return api.put<VirtualServer>(`/v1/virtual-servers/${encodeURIComponent(serverId)}`, { tags });
}

/**
 * Test whether a virtual server's own MCP endpoint speaks MCP via a protocol handshake.
 *
 * Unlike the gateway-scoped {@link serversApi.testHandshake}, the target isn't a
 * caller-supplied URL — the backend derives it from the server's own ID and
 * dispatches in-process, reusing the caller's own forwarded credentials
 * (session/bearer token) by default. `request.headers` overrides those
 * credentials when provided.
 *
 * Calls POST /v1/virtual-servers/{id}/test-handshake.
 */
export function testVirtualServerHandshake(
  serverId: string,
  request: ServerHandshakeRequest,
  signal?: AbortSignal,
): Promise<GatewayHandshakeResponse> {
  return api.post(`/v1/virtual-servers/${encodeURIComponent(serverId)}/test-handshake`, request, {
    signal,
  });
}
