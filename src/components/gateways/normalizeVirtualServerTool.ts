import type { Tool } from "@/types/tool";

export interface VirtualServerTool extends Tool {
  gateway_id?: string;
  invalidGatewayId?: boolean;
}

export function normalizeVirtualServerTool(tool: VirtualServerTool): VirtualServerTool {
  const record = tool as unknown as Record<string, unknown>;
  const gatewayId = nonEmptyString(record.gatewayId) ?? nonEmptyString(record.gateway_id);
  const invalidGatewayId =
    !gatewayId &&
    [record.gatewayId, record.gateway_id].some(
      (value) => typeof value === "string" && !value.trim(),
    );
  return {
    ...tool,
    annotations: asRecord(tool.annotations) ?? {},
    displayName: nonEmptyString(record.displayName) ?? nonEmptyString(record.display_name),
    gatewayId: gatewayId ?? null,
    invalidGatewayId,
    gatewaySlug: tool.gatewaySlug ?? nonEmptyString(record.gateway_slug) ?? "",
    inputSchema: asRecord(tool.inputSchema) ?? asRecord(record.input_schema) ?? {},
    originalName:
      nonEmptyString(record.originalName) ?? nonEmptyString(record.original_name) ?? tool.name,
    outputSchema: asRecord(tool.outputSchema) ?? asRecord(record.output_schema),
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
