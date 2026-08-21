import type { CodeBlockLanguage } from "@/components/ui/code-block";

export const URL_ENV = "MCPGATEWAY_URL";
export const TOKEN_ENV = "MCPGATEWAY_BEARER_TOKEN";

export type ResourceSnippetLanguage = "curl" | "jsonRpc" | "python" | "typescript";

export interface ResourceSnippetInput {
  /** Concrete resource URI — placeholders already substituted by the caller. */
  uri: string;
}

export interface ResourceSnippetSpec {
  value: ResourceSnippetLanguage;
  labelId: string;
  language: string;
  prismLanguage: CodeBlockLanguage;
  build: (input: ResourceSnippetInput) => string;
}

// Renders a value as its own single-quoted bash literal, safe to place
// directly after a double-quoted segment (bash concatenates adjacent quoted
// segments with no separator). Single quotes neutralize $, `, and " — unlike
// double quotes, which leave them live for expansion/substitution. Bash
// treats ' as a hard terminator with no inner escape; the idiom to embed a
// literal ' is to close the quoted run, emit \', and reopen: '\''.
function bashSingleQuoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * The only tab that hits the actual preview wire call
 * (`GET /v1/resources/test/{uri}`) — the REST analog of the Prompts
 * `POST /prompts/{name}` snippet. Resources have no equivalent named REST
 * endpoint for reads, so the other three tabs show the MCP `resources/read`
 * shape instead (see {@link buildResourceJsonRpc}).
 */
export function buildResourceCurl({ uri }: ResourceSnippetInput): string {
  return [
    `curl -H "Authorization: Bearer $${TOKEN_ENV}" \\`,
    `  "$${URL_ENV}/v1/resources/test/"${bashSingleQuoteLiteral(uri)}`,
  ].join("\n");
}

export function buildResourceJsonRpc({ uri }: ResourceSnippetInput): string {
  const envelope = {
    jsonrpc: "2.0",
    id: 1,
    method: "resources/read",
    params: { uri },
  };
  return JSON.stringify(envelope, null, 2);
}

export function buildResourcePython({ uri }: ResourceSnippetInput): string {
  return [
    "import os",
    "import requests",
    "",
    "response = requests.post(",
    `    f"{os.environ['${URL_ENV}']}/rpc",`,
    `    headers={"Authorization": f"Bearer {os.environ['${TOKEN_ENV}']}"},`,
    "    json={",
    '        "jsonrpc": "2.0",',
    '        "id": 1,',
    '        "method": "resources/read",',
    `        "params": {"uri": ${JSON.stringify(uri)}},`,
    "    },",
    ")",
    "response.raise_for_status()",
    "print(response.json())",
  ].join("\n");
}

export function buildResourceTypescript({ uri }: ResourceSnippetInput): string {
  return [
    `const response = await fetch(\`\${process.env.${URL_ENV}}/rpc\`, {`,
    `  method: "POST",`,
    `  headers: {`,
    `    Authorization: \`Bearer \${process.env.${TOKEN_ENV}}\`,`,
    `    "Content-Type": "application/json",`,
    `  },`,
    `  body: JSON.stringify({`,
    `    jsonrpc: "2.0",`,
    `    id: 1,`,
    `    method: "resources/read",`,
    `    params: { uri: ${JSON.stringify(uri)} },`,
    `  }),`,
    `});`,
    `if (!response.ok) throw new Error(\`Resource read failed: \${response.status}\`);`,
    `const data = await response.json();`,
  ].join("\n");
}

export const RESOURCE_SNIPPETS: ResourceSnippetSpec[] = [
  {
    value: "curl",
    labelId: "resources.details.code.tab.curl",
    language: "curl",
    prismLanguage: "bash",
    build: buildResourceCurl,
  },
  {
    value: "jsonRpc",
    labelId: "resources.details.code.tab.jsonRpc",
    language: "JSON-RPC",
    prismLanguage: "json",
    build: buildResourceJsonRpc,
  },
  {
    value: "python",
    labelId: "resources.details.code.tab.python",
    language: "Python",
    prismLanguage: "python",
    build: buildResourcePython,
  },
  {
    value: "typescript",
    labelId: "resources.details.code.tab.typescript",
    language: "TypeScript",
    prismLanguage: "tsx",
    build: buildResourceTypescript,
  },
];
