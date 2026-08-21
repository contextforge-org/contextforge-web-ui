import { describe, it, expect } from "vitest";
import {
  buildResourceCurl,
  buildResourceJsonRpc,
  buildResourcePython,
  buildResourceTypescript,
  RESOURCE_SNIPPETS,
} from "./buildResourceSnippets";

const uri = "github://repos/ibm/mcp-context-forge/contents/README.md";

describe("buildResourceCurl", () => {
  it("targets GET /v1/resources/test/{uri}, single-quoted as its own literal", () => {
    const snippet = buildResourceCurl({ uri });
    expect(snippet).toContain(`/v1/resources/test/"'${uri}'`);
    expect(snippet).toContain("Authorization: Bearer");
    expect(snippet).not.toContain("resources/read");
  });

  it("neutralizes shell metacharacters in the uri instead of splicing them into the double-quoted segment", () => {
    const dangerous = `file:///a"; rm -rf ~; echo "$(whoami)\`id\``;
    const snippet = buildResourceCurl({ uri: dangerous });

    // The whole dangerous uri must land inside a single-quoted literal, where
    // $, `, and " are inert — never inside the preceding double-quoted prefix.
    expect(snippet).toContain(`/v1/resources/test/"'${dangerous}'`);
  });

  it("escapes a literal single quote in the uri using the '\\'' idiom", () => {
    const snippet = buildResourceCurl({ uri: "a'b" });

    expect(snippet).toContain(`/v1/resources/test/"'a'\\''b'`);
  });
});

describe("buildResourceJsonRpc", () => {
  it("builds a resources/read envelope with the resolved uri", () => {
    const envelope = JSON.parse(buildResourceJsonRpc({ uri }));
    expect(envelope).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: { uri },
    });
  });
});

describe("buildResourcePython", () => {
  it("POSTs a resources/read JSON-RPC body to /rpc", () => {
    const snippet = buildResourcePython({ uri });
    expect(snippet).toContain("/rpc");
    expect(snippet).toContain('"method": "resources/read"');
    expect(snippet).toContain(JSON.stringify(uri));
  });
});

describe("buildResourceTypescript", () => {
  it("fetches /rpc with a resources/read JSON-RPC body", () => {
    const snippet = buildResourceTypescript({ uri });
    expect(snippet).toContain("/rpc");
    expect(snippet).toContain('method: "resources/read"');
    expect(snippet).toContain(JSON.stringify(uri));
  });
});

describe("RESOURCE_SNIPPETS", () => {
  it("declares exactly the four documented tabs in order", () => {
    expect(RESOURCE_SNIPPETS.map((s) => s.value)).toEqual([
      "curl",
      "jsonRpc",
      "python",
      "typescript",
    ]);
  });
});
