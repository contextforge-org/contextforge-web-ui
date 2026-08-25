import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";
import {
  disconnectCatalogGateway,
  getGatewayImpactPreview,
  registerCatalogServer,
  testCatalogServer,
} from "./catalog";

describe("registerCatalogServer", () => {
  it("POSTs the URL-encoded catalog id through the API proxy", async () => {
    let requestPath = "";
    server.use(
      http.post("*/api/v1/catalog/:catalogId/register", ({ request }) => {
        requestPath = new URL(request.url).pathname;
        return HttpResponse.json({
          success: true,
          server_id: "gateway-1",
          message: "Registered",
        });
      }),
    );

    const result = await registerCatalogServer("server/id with space");

    expect(requestPath).toBe("/api/v1/catalog/server%2Fid%20with%20space/register");
    expect(result).toEqual({
      success: true,
      server_id: "gateway-1",
      message: "Registered",
    });
  });

  it("DELETEs an encoded gateway ID and preserves async lifecycle metadata", async () => {
    let requestPath = "";
    server.use(
      http.delete("*/api/v1/gateways/:gatewayId", ({ request }) => {
        requestPath = new URL(request.url).pathname;
        return HttpResponse.json(
          { status: "deleting" },
          { status: 202, headers: { "Retry-After": "2" } },
        );
      }),
    );

    const result = await disconnectCatalogGateway("gateway/id");

    expect(requestPath).toBe("/api/v1/gateways/gateway%2Fid");
    expect(result.status).toBe(202);
    expect(result.headers.get("Retry-After")).toBe("2");
  });

  it("tests catalog URL with a safe fixed GET request", async () => {
    let body: unknown;
    server.use(
      http.post("*/api/v1/mcp-servers/test", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ statusCode: 204, latencyMs: 21 });
      }),
    );

    await expect(testCatalogServer("https://catalog.example/mcp")).resolves.toEqual({
      statusCode: 204,
      latencyMs: 21,
    });
    expect(body).toEqual({
      method: "GET",
      baseUrl: "https://catalog.example/mcp",
      path: "",
      headers: { Accept: "text/event-stream" },
    });
  });

  it("gets only the backend-provided disconnect impact preview", async () => {
    server.use(
      http.get("*/api/v1/gateways/:gatewayId/impact-preview", () =>
        HttpResponse.json({
          gatewayId: "gateway-1",
          servers: [{ id: "server-1", name: "Visible server" }],
        }),
      ),
    );

    await expect(getGatewayImpactPreview("gateway-1")).resolves.toEqual({
      gatewayId: "gateway-1",
      servers: [{ id: "server-1", name: "Visible server" }],
    });
  });
});
