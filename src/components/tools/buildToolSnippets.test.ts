import { describe, expect, it } from "vitest";

import {
  buildToolCurl,
  buildToolJsonRpc,
  buildToolPython,
  buildToolTypescript,
  TOOL_SNIPPET_MCP_VERSION,
} from "./buildToolSnippets";

const input = {
  toolName: "gateway.search_issues",
  args: { query: "can't reproduce", limit: 5, dryRun: false },
};

describe("buildToolSnippets", () => {
  it("pins the supported MCP version used by the badge", () => {
    expect(TOOL_SNIPPET_MCP_VERSION).toBe("2025-11-25");
  });

  it("builds the canonical tools/call JSON-RPC envelope", () => {
    expect(JSON.parse(buildToolJsonRpc(input))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "gateway.search_issues",
        arguments: { query: "can't reproduce", limit: 5, dryRun: false },
      },
    });
  });

  it("targets a real gateway placeholder instead of the browser BFF path", () => {
    const snippet = buildToolCurl(input);

    expect(snippet).toContain("$MCPGATEWAY_URL/rpc");
    expect(snippet).toContain("Authorization: Bearer $MCPGATEWAY_BEARER_TOKEN");
    expect(snippet).not.toContain("/api/rpc");
    expect(snippet).toContain(`"method":"tools/call"`);
    expect(snippet).toContain(`"name":"gateway.search_issues"`);
    expect(snippet).toContain(`can'\\''t reproduce`);
  });

  it("emits Python that keeps JSON booleans and nulls valid", () => {
    const snippet = buildToolPython({
      toolName: "nullable_tool",
      args: { active: true, optional: null },
    });

    expect(snippet).toContain("json.loads(payload)");
    expect(snippet).toContain('\\"active\\": true');
    expect(snippet).toContain('\\"optional\\": null');
    expect(snippet).toContain("os.environ['MCPGATEWAY_URL']");
    expect(snippet).not.toContain("$MCPGATEWAY_URL");
  });

  it("checks both HTTP and JSON-RPC failures in TypeScript", () => {
    const snippet = buildToolTypescript(input);

    expect(snippet).toContain("process.env.MCPGATEWAY_URL");
    expect(snippet).toContain("process.env.MCPGATEWAY_BEARER_TOKEN");
    expect(snippet).toContain('method: "tools/call"');
    expect(snippet).toContain("if (!response.ok)");
    expect(snippet).toContain("if (data.error)");
  });
});
