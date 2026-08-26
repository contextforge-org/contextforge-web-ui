import type { CodeBlockLanguage } from "@/components/ui/code-block";

export const TOOL_SNIPPET_MCP_VERSION = "2025-11-25";
export const URL_ENV = "MCPGATEWAY_URL";
export const TOKEN_ENV = "MCPGATEWAY_BEARER_TOKEN";

export type ToolSnippetLanguage = "curl" | "jsonRpc" | "python" | "typescript";

export interface ToolSnippetInput {
  args: Record<string, unknown>;
  toolName: string;
}

export interface ToolSnippetSpec {
  value: ToolSnippetLanguage;
  labelId: string;
  language: string;
  prismLanguage: CodeBlockLanguage;
  build: (input: ToolSnippetInput) => string;
}

function buildToolCallEnvelope({ toolName, args }: ToolSnippetInput) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args,
    },
  };
}

function bashSingleQuoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function buildToolCurl(input: ToolSnippetInput): string {
  const body = JSON.stringify(buildToolCallEnvelope(input));
  return [
    `curl -X POST "$${URL_ENV}/rpc" \\`,
    `  -H "Authorization: Bearer $${TOKEN_ENV}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d ${bashSingleQuoteLiteral(body)}`,
  ].join("\n");
}

export function buildToolJsonRpc(input: ToolSnippetInput): string {
  return JSON.stringify(buildToolCallEnvelope(input), null, 2);
}

export function buildToolPython({ toolName, args }: ToolSnippetInput): string {
  const payload = JSON.stringify(
    JSON.stringify(buildToolCallEnvelope({ toolName, args }), null, 2),
  );
  return [
    "import json",
    "import os",
    "import requests",
    "",
    `payload = ${payload}`,
    "",
    "response = requests.post(",
    `    f"{os.environ['${URL_ENV}']}/rpc",`,
    `    headers={"Authorization": f"Bearer {os.environ['${TOKEN_ENV}']}"},`,
    "    json=json.loads(payload),",
    ")",
    "response.raise_for_status()",
    "print(response.json())",
  ].join("\n");
}

export function buildToolTypescript({ toolName, args }: ToolSnippetInput): string {
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
    `    method: "tools/call",`,
    `    params: {`,
    `      name: ${JSON.stringify(toolName)},`,
    `      arguments: ${JSON.stringify(args)},`,
    `    },`,
    `  }),`,
    `});`,
    `if (!response.ok) throw new Error(\`Tool call failed: \${response.status}\`);`,
    `const data = await response.json();`,
    `if (data.error) throw new Error(data.error.message);`,
  ].join("\n");
}

export const TOOL_SNIPPETS: ToolSnippetSpec[] = [
  {
    value: "curl",
    labelId: "tools.details.code.tab.curl",
    language: "curl",
    prismLanguage: "bash",
    build: buildToolCurl,
  },
  {
    value: "jsonRpc",
    labelId: "tools.details.code.tab.jsonRpc",
    language: "JSON-RPC",
    prismLanguage: "json",
    build: buildToolJsonRpc,
  },
  {
    value: "python",
    labelId: "tools.details.code.tab.python",
    language: "Python",
    prismLanguage: "python",
    build: buildToolPython,
  },
  {
    value: "typescript",
    labelId: "tools.details.code.tab.typescript",
    language: "TypeScript",
    prismLanguage: "tsx",
    build: buildToolTypescript,
  },
];
