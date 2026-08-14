import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";
import { registerCatalogServer } from "./catalog";

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
});
