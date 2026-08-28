import type { CodeBlockLanguage } from "@/components/ui/code-block";

export const TOOL_SNIPPET_MCP_VERSION = "2025-11-25";
export const URL_ENV = "MCPGATEWAY_URL";
export const TOKEN_ENV = "MCPGATEWAY_BEARER_TOKEN";

export type ToolSnippetLanguage = "curl" | "json" | "jsonRpc" | "python" | "typescript";

export interface ToolSnippetInput {
  args: Record<string, unknown>;
  serverId?: string;
  toolName: string;
}

export interface ToolSnippetSpec {
  value: ToolSnippetLanguage;
  labelId: string;
  language: string;
  prismLanguage: CodeBlockLanguage;
  build: (input: ToolSnippetInput) => string;
}

function buildToolCallEnvelope({ toolName, args, serverId }: ToolSnippetInput) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: toolName,
      ...(serverId ? { server_id: serverId } : {}),
      arguments: args,
    },
  };
}

function buildToolPreviewBody({ args, serverId }: ToolSnippetInput) {
  return {
    arguments: args,
    ...(serverId ? { server_id: serverId } : {}),
  };
}

function buildToolPreviewPath(toolName: string): string {
  return `/v1/tools/preview/${encodeURIComponent(toolName)}`;
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

export function buildToolPython({ toolName, args, serverId }: ToolSnippetInput): string {
  const payload = JSON.stringify(
    JSON.stringify(buildToolCallEnvelope({ toolName, args, serverId }), null, 2),
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

export function buildToolTypescript({ toolName, args, serverId }: ToolSnippetInput): string {
  const serverIdLine = serverId ? `      server_id: ${JSON.stringify(serverId)},` : null;
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
    ...(serverIdLine ? [serverIdLine] : []),
    `      arguments: ${JSON.stringify(args)},`,
    `    },`,
    `  }),`,
    `});`,
    `if (!response.ok) throw new Error(\`Tool call failed: \${response.status}\`);`,
    `const data = await response.json();`,
    `if (data.error) throw new Error(data.error.message);`,
  ].join("\n");
}

export function buildToolPreviewCurl(input: ToolSnippetInput): string {
  const body = JSON.stringify(buildToolPreviewBody(input));
  return [
    `curl -X POST "$${URL_ENV}${buildToolPreviewPath(input.toolName)}" \\`,
    `  -H "Authorization: Bearer $${TOKEN_ENV}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d ${bashSingleQuoteLiteral(body)}`,
  ].join("\n");
}

export function buildToolPreviewJson(input: ToolSnippetInput): string {
  return JSON.stringify(buildToolPreviewBody(input), null, 2);
}

export function buildToolPreviewPython(input: ToolSnippetInput): string {
  const payload = JSON.stringify(JSON.stringify(buildToolPreviewBody(input), null, 2));
  return [
    "import json",
    "import os",
    "import requests",
    "",
    `payload = ${payload}`,
    "",
    "response = requests.post(",
    `    f"{os.environ['${URL_ENV}']}${buildToolPreviewPath(input.toolName)}",`,
    `    headers={"Authorization": f"Bearer {os.environ['${TOKEN_ENV}']}"},`,
    "    json=json.loads(payload),",
    ")",
    "response.raise_for_status()",
    "print(response.json())",
  ].join("\n");
}

export function buildToolPreviewTypescript(input: ToolSnippetInput): string {
  return [
    `const response = await fetch(\`\${process.env.${URL_ENV}}${buildToolPreviewPath(input.toolName)}\`, {`,
    `  method: "POST",`,
    `  headers: {`,
    `    Authorization: \`Bearer \${process.env.${TOKEN_ENV}}\`,`,
    `    "Content-Type": "application/json",`,
    `  },`,
    `  body: JSON.stringify(${JSON.stringify(buildToolPreviewBody(input))}),`,
    `});`,
    `if (!response.ok) throw new Error(\`Tool preview failed: \${response.status}\`);`,
    `const data = await response.json();`,
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

export const TOOL_PREVIEW_SNIPPETS: ToolSnippetSpec[] = [
  {
    value: "curl",
    labelId: "tools.details.code.tab.curl",
    language: "curl",
    prismLanguage: "bash",
    build: buildToolPreviewCurl,
  },
  {
    value: "json",
    labelId: "tools.details.code.tab.json",
    language: "JSON",
    prismLanguage: "json",
    build: buildToolPreviewJson,
  },
  {
    value: "python",
    labelId: "tools.details.code.tab.python",
    language: "Python",
    prismLanguage: "python",
    build: buildToolPreviewPython,
  },
  {
    value: "typescript",
    labelId: "tools.details.code.tab.typescript",
    language: "TypeScript",
    prismLanguage: "tsx",
    build: buildToolPreviewTypescript,
  },
];
