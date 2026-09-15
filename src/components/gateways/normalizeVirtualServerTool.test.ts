import { describe, expect, it } from "vitest";

import { normalizeVirtualServerTool, type VirtualServerTool } from "./normalizeVirtualServerTool";

describe("normalizeVirtualServerTool", () => {
  it("adapts snake_case virtual-server tool fields", () => {
    const tool = {
      id: "tool-1",
      name: "github.search_issues",
      display_name: "Find issues",
      original_name: "search_issues",
      gateway_id: "gateway-1",
      gateway_slug: "github-mcp",
      input_schema: { type: "object", properties: { query: { type: "string" } } },
      output_schema: { type: "object", properties: { count: { type: "integer" } } },
      annotations: { readOnlyHint: true },
    } as unknown as VirtualServerTool;

    expect(normalizeVirtualServerTool(tool)).toMatchObject({
      displayName: "Find issues",
      originalName: "search_issues",
      gatewayId: "gateway-1",
      gatewaySlug: "github-mcp",
      inputSchema: { properties: { query: { type: "string" } } },
      outputSchema: { properties: { count: { type: "integer" } } },
      annotations: { readOnlyHint: true },
    });
  });

  it("keeps camelCase values when both shapes are present", () => {
    const tool = {
      id: "tool-1",
      name: "github.search_issues",
      displayName: "Camel label",
      display_name: "Snake label",
      originalName: "camel_name",
      original_name: "snake_name",
      gatewayId: "camel-gateway-id",
      gateway_id: "snake-gateway-id",
      gatewaySlug: "camel-gateway-slug",
      gateway_slug: "snake-gateway-slug",
      inputSchema: { type: "object", properties: { camel: { type: "string" } } },
      input_schema: { type: "object", properties: { snake: { type: "string" } } },
      outputSchema: { type: "object", properties: { camel: { type: "string" } } },
      output_schema: { type: "object", properties: { snake: { type: "string" } } },
    } as unknown as VirtualServerTool;

    const normalized = normalizeVirtualServerTool(tool);
    expect(normalized.displayName).toBe("Camel label");
    expect(normalized.originalName).toBe("camel_name");
    expect(normalized.gatewayId).toBe("camel-gateway-id");
    expect(normalized.gatewaySlug).toBe("camel-gateway-slug");
    expect(normalized.inputSchema).toEqual(tool.inputSchema);
    expect(normalized.outputSchema).toEqual(tool.outputSchema);
  });
});
