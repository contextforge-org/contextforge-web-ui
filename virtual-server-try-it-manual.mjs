// Manual UI testing for virtual-server scoped tool testing.
//
// Terminal A:
//   VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT=true npm run dev
//
// Terminal B:
//   node virtual-server-try-it-manual.mjs
//   BASE_URL=http://localhost:5176 node virtual-server-try-it-manual.mjs  # if Vite uses another port
//
// Optional modes:
//   PERMISSIONS=NO_EXECUTE node virtual-server-try-it-manual.mjs
//   PERMISSIONS=NO_SERVERS_USE node virtual-server-try-it-manual.mjs
//   TOOLS=EMPTY node virtual-server-try-it-manual.mjs
//
// Ctrl-C in terminal B to close the headed browser.

import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const HEADED = !process.env.HEADLESS;
const PERMISSIONS =
  process.env.PERMISSIONS === "NO_EXECUTE"
    ? ["servers.read", "servers.use"]
    : process.env.PERMISSIONS === "NO_SERVERS_USE"
      ? ["servers.read", "tools.execute"]
      : ["*"];
const PERMISSIONS_MODE = process.env.PERMISSIONS ?? "full access";

const SERVER_ID = "76c7b637dafc4d7197f14817ddffeda9"; // pragma: allowlist secret

const USER = {
  email: "test@example.com",
  full_name: "Test User",
  is_admin: true,
  is_active: true,
  auth_provider: "local",
  email_verified: true,
  password_change_required: false,
};

const VIRTUAL_SERVER = {
  id: SERVER_ID,
  name: "testVS",
  description: "Virtual server endpoint: developer tooling server exposing repository workflows.",
  icon: "",
  createdAt: "2026-04-28T15:41:31.233166",
  updatedAt: "2026-04-28T15:41:31.233168",
  enabled: true,
  associatedTools: ["Get Repo Issues", "Create New Issue"],
  associatedToolIds: ["GITHUB_GET_REPO_ISSUES", "GITHUB_CREATE_ISSUE"],
  associatedResources: ["github://repo/{owner}/{repo}"],
  associatedPrompts: ["summarize_pull_request"],
  associatedA2aAgents: [],
  metrics: null,
  tags: [{ id: "tag-development", label: "development" }],
  createdBy: "admin@example.com",
  createdFromIp: "127.0.0.1",
  createdVia: "ui",
  createdUserAgent: "Mozilla/5.0",
  modifiedBy: null,
  modifiedFromIp: null,
  modifiedVia: null,
  modifiedUserAgent: null,
  importBatchId: null,
  federationSource: null,
  version: 1,
  teamId: "0a9b06bd22974fe386dcacb18548ed61", // pragma: allowlist secret
  team: "Platform Administrator's Team",
  ownerEmail: "admin@example.com",
  visibility: "public",
  oauthEnabled: false,
  oauthConfig: null,
};

const MCP_SERVER = {
  id: "mcp-gateway-1",
  name: "github-mcp",
  url: "http://localhost:9000",
  transport: "SSE",
  enabled: true,
  reachable: true,
  visibility: "public",
  tool_count: 1,
  resource_count: 1,
  prompt_count: 1,
  created_at: "2026-04-28T15:41:31.233166",
  updated_at: "2026-04-28T15:41:31.233168",
};

function makeTool(overrides = {}) {
  return {
    id: "tool-search",
    name: "github.search_issues",
    originalName: "search_issues",
    description: "Search repository issues through the selected virtual server.",
    originalDescription: "Search repository issues through the selected virtual server.",
    title: "Search issues",
    displayName: "Search issues",
    gatewayId: "mcp-gateway-1",
    gatewaySlug: "github-mcp",
    customName: "",
    customNameSlug: "search_issues",
    enabled: true,
    reachable: true,
    deprecated: false,
    executionCount: 0,
    tags: [],
    integrationType: "MCP",
    requestType: "http",
    url: "https://example.com/mcp",
    headers: {},
    annotations: { readOnlyHint: true },
    jsonpathFilter: null,
    auth: null,
    version: 1,
    visibility: "team",
    createdAt: "2026-04-10T10:00:00Z",
    updatedAt: "2026-04-10T10:00:00Z",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "integer", description: "Maximum results" },
      },
    },
    outputSchema: { type: "object" },
    ...overrides,
  };
}

const TOOLS = process.env.TOOLS === "EMPTY" ? [] : [makeTool()];

function json(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function fallbackApiBody(pathname) {
  if (pathname.startsWith("/api/v1/resources")) return { resources: [] };
  if (pathname.startsWith("/api/v1/prompts")) return { prompts: [] };
  if (pathname.startsWith("/api/v1/tools")) return { tools: [] };
  if (pathname.startsWith("/api/v1/mcp-servers")) return { gateways: [], nextCursor: null };
  if (pathname.startsWith("/api/v1/virtual-servers")) return { servers: [] };
  return {};
}

function interestingHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) =>
      ["x-csrf-token", "x-tenant-id", "x-api-key", "authorization"].includes(name.toLowerCase()),
    ),
  );
}

function toolResult(text, extra = {}) {
  return {
    target: { kind: "federated", gateway_name: "github-mcp" },
    content: [{ type: "text", text, mimeType: "text/plain" }],
    structured_output: extra,
  };
}

const browser = await chromium.launch({ headless: !HEADED });
const context = await browser.newContext({ viewport: { width: 1512, height: 950 } });
const page = await context.newPage();

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    console.log(`browser ${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  console.log(`browser pageerror: ${error.message}`);
});

await page.route("**/*", (route) => {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname.startsWith("/api/")) return route.fulfill(json(fallbackApiBody(pathname)));
  return route.fallback();
});

await page.route("**/auth/session", (route) =>
  route.fulfill(
    json({
      authenticated: true,
      user: USER,
      csrfToken: "mock-csrf-token",
    }),
  ),
);

await page.route("**/api/rbac/my/permissions**", (route) => route.fulfill(json(PERMISSIONS)));
await page.route("**/api/v1/virtual-servers?*", (route) =>
  route.fulfill(json({ servers: [VIRTUAL_SERVER] })),
);
await page.route(`**/api/v1/virtual-servers/${SERVER_ID}`, (route) =>
  route.fulfill(json(VIRTUAL_SERVER)),
);
await page.route(`**/api/v1/virtual-servers/${SERVER_ID}/tools?*`, (route) =>
  route.fulfill(json({ tools: TOOLS })),
);
await page.route(`**/api/v1/virtual-servers/${SERVER_ID}/resources?*`, (route) =>
  route.fulfill(json({ resources: [] })),
);
await page.route(`**/api/v1/virtual-servers/${SERVER_ID}/prompts?*`, (route) =>
  route.fulfill(json({ prompts: [] })),
);
await page.route("**/api/v1/mcp-servers?*", (route) =>
  route.fulfill(json({ gateways: [MCP_SERVER], nextCursor: null })),
);

await page.route("**/api/v1/tools/preview/github.search_issues", async (route) => {
  const request = route.request();
  const body = request.postDataJSON();
  const headers = request.headers();

  console.log("\n/api/v1/tools/preview/github.search_issues request body:");
  console.log(JSON.stringify(body, null, 2));
  console.log("preview interesting headers:");
  console.log(JSON.stringify(interestingHeaders(headers), null, 2));

  return route.fulfill(
    json({
      target: { kind: "federated", gateway_name: "github-mcp" },
      resolved_arguments: body?.arguments ?? {},
      annotations: { readOnlyHint: true },
      pre_hooks_run: [],
      warnings: [],
    }),
  );
});

await page.route("**/api/rpc", async (route) => {
  const request = route.request();
  const body = request.postDataJSON();
  const headers = request.headers();

  console.log("\n/api/rpc request body:");
  console.log(JSON.stringify(body, null, 2));
  console.log("/api/rpc interesting headers:");
  console.log(JSON.stringify(interestingHeaders(headers), null, 2));

  return route.fulfill(
    json({
      jsonrpc: "2.0",
      id: body.id,
      result: toolResult(`Scoped result for ${body?.params?.name}`, {
        receivedArguments: body?.params?.arguments ?? {},
        serverId: body?.params?.server_id ?? null,
        tenantHeader: headers["x-tenant-id"] ?? null,
      }),
    }),
  );
});

await page.addInitScript(() => {
  sessionStorage.setItem("mcpgateway_token", "placeholder-token");
});

await page.goto(`${BASE}/app/gateways`, { waitUntil: "networkidle" });

const cardCount = await page.getByRole("button", { name: "Actions for testVS" }).count();
console.log(`virtual server actions: ${cardCount ? "ok" : "MISSING"}`);
console.log(`app URL: ${BASE}/app/gateways`);
console.log(`permissions mode: ${PERMISSIONS_MODE}`);
console.log(`tools mode: ${process.env.TOOLS ?? "attached tool"}`);

if (!HEADED) {
  await browser.close();
} else {
  console.log(`
Browser open. Try:

  1. Open "Actions for testVS" -> "View details".
     Expect the details drawer to open with the handshake "Try it" tab selected.

  2. Click "Components", then open "Actions for Search issues" -> "Test".
     The "Test" menu item is text-only. Expect "Test tool", a "Search issues"
     selected-tool chip, and "Clear" instead of a back button. Preview mode is selected.
     Under "Live invocation", expect "Writes, external requests, and quota use happen immediately."

  3. Fill query="cloudflare" and limit="5".
     Add header X-Tenant-Id=team-a.
     Click "Preview".
     Expect "Preview 200".

  4. Terminal should show /api/v1/tools/preview/github.search_issues with:
       server_id "${SERVER_ID}"
       arguments query="cloudflare", limit=5
       x-tenant-id "team-a"

  5. Enable "Live invocation".
     Expect "Live invocation is enabled. Review your arguments carefully or switch back to preview mode."
     Click "Live invoke".
     Expect "Live invoke 200", "Requested through testVS",
     "Answered by github-mcp", and "Scoped result for github.search_issues".

  6. Terminal should show /api/rpc with:
       method "tools/call"
       params.name "github.search_issues"
       params.server_id "${SERVER_ID}"
       params.arguments query="cloudflare", limit=5
       x-tenant-id "team-a"

  7. Click "Clear". Expect the Components list again, with keyboard focus on
     "Actions for Search issues".

  8. Optional RBAC denial (restart this script):
       BASE_URL=${BASE} PERMISSIONS=NO_EXECUTE node virtual-server-try-it-manual.mjs
     Expect Preview to remain available and the Live invocation switch to be disabled with
     "Live invoke requires tools.execute."

  9. Optional servers.use denial (restart this script):
       BASE_URL=${BASE} PERMISSIONS=NO_SERVERS_USE node virtual-server-try-it-manual.mjs
     Expect Preview to remain available and the Live invocation switch to be disabled with
     "Live invoke requires servers.use."

  10. Optional empty fetched tools (restart this script):
       BASE_URL=${BASE} TOOLS=EMPTY node virtual-server-try-it-manual.mjs
     Expect fallback component rows to remain visible without a "Test" action.

Ctrl-C to close.
`);
  await new Promise(() => {});
}
