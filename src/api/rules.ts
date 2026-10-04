/**
 * Rules API service.
 *
 * Wraps the gateway rule catalog (`/rbac/rules`) that backs Layer-2 RBAC
 * overlay decisions. Mutations require the `rbac.rules.manage` permission
 * server-side; the UI gates visibility with the same permission but the
 * endpoints remain the authority.
 */

import { api } from "./client";

export type RuleEffect = "allow" | "deny";
export type RulePhase = "pre_invocation" | "post_invocation";
export type CapabilityType =
  "tool" | "resource" | "prompt" | "server" | "gateway" | "a2a_agent" | "route";

export interface RbacRule {
  id: string;
  name: string;
  description: string;
  capability_type: CapabilityType;
  capability_id: string | null;
  permission: string | null;
  phase: RulePhase;
  predicate: string;
  effect: RuleEffect;
  priority: number;
  is_active: boolean;
  is_system: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface RbacRuleCreate {
  name: string;
  description?: string;
  capability_type: CapabilityType;
  capability_id?: string | null;
  permission?: string | null;
  phase?: RulePhase;
  predicate: string;
  effect: RuleEffect;
  priority?: number;
  expires_at?: string | null;
}

export interface RbacRuleUpdate {
  description?: string;
  capability_id?: string | null;
  permission?: string | null;
  phase?: RulePhase;
  predicate?: string;
  effect?: RuleEffect;
  priority?: number;
  is_active?: boolean;
  expires_at?: string | null;
}

export interface EntityRulesSummary {
  rules: RbacRule[];
  inherited: RbacRule[];
  defaults: Record<string, string[]>;
}

export interface RuleListParams {
  capabilityType?: CapabilityType;
  capabilityId?: string;
  signal?: AbortSignal;
}

export const rulesApi = {
  /**
   * List catalog rules, optionally filtered by capability.
   *
   * @param params.capabilityType Filter by capability type.
   * @param params.capabilityId Filter by entity id.
   */
  list: (params?: RuleListParams): Promise<RbacRule[]> => {
    const query = new URLSearchParams();
    if (params?.capabilityType) query.set("capability_type", params.capabilityType);
    if (params?.capabilityId) query.set("capability_id", params.capabilityId);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return api.get<RbacRule[]>(`/rbac/rules${suffix}`, undefined, params?.signal);
  },

  /**
   * Create a rule. The gateway validates the predicate server-side and
   * answers 422 with a machine-readable detail on syntax errors.
   */
  create: (body: RbacRuleCreate): Promise<RbacRule> => api.post<RbacRule>("/rbac/rules", body),

  /**
   * Update editable fields of one rule.
   */
  update: (id: string, body: RbacRuleUpdate): Promise<RbacRule> =>
    api.patch<RbacRule>(`/rbac/rules/${encodeURIComponent(id)}`, body),

  /**
   * Delete one rule. System seed rows answer 409.
   */
  remove: (id: string): Promise<void> => api.delete<void>(`/rbac/rules/${encodeURIComponent(id)}`),

  /**
   * Read the per-entity view: entity-scoped rules, type-inherited rules,
   * and the built-in defaults for the capability type.
   */
  entitySummary: (
    capabilityType: CapabilityType,
    capabilityId: string,
    signal?: AbortSignal,
  ): Promise<EntityRulesSummary> => {
    const query = `?capability_type=${encodeURIComponent(capabilityType)}&capability_id=${encodeURIComponent(capabilityId)}`;
    return api.get<EntityRulesSummary>(`/rbac/rules/entity-summary${query}`, undefined, signal);
  },
};

export interface ToolAttributes {
  rule_attributes: string[];
  schema_attributes: string[];
  forced_attributes: string[];
  all_attributes: string[];
}

export const toolAttributesApi = {
  /** Fetch the attribute names available for args.* predicates. */
  get: (params?: {
    toolName?: string;
    gatewayId?: string;
    serverId?: string;
  }): Promise<ToolAttributes> => {
    const query = new URLSearchParams();
    if (params?.toolName) query.set("tool_name", params.toolName);
    if (params?.gatewayId) query.set("gateway_id", params.gatewayId);
    if (params?.serverId) query.set("server_id", params.serverId);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return api.get<ToolAttributes>(`/rbac/rules/tool-attributes${suffix}`);
  },

  /** Set forced header params on a gateway. */
  setGatewayForced: (
    gatewayId: string,
    params: string[],
  ): Promise<{ forced_header_params: string[] }> =>
    api.patch(`/rbac/rules/gateway/${encodeURIComponent(gatewayId)}/forced-params`, params),

  /** Set forced header params on a virtual server. */
  setServerForced: (
    serverId: string,
    params: string[],
  ): Promise<{ forced_header_params: string[] }> =>
    api.patch(`/rbac/rules/server/${encodeURIComponent(serverId)}/forced-params`, params),
};
