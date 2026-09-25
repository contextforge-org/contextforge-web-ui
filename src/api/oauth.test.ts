import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";
import { getOAuthStatuses, normalizeGatewayIds } from "./oauth";

describe("normalizeGatewayIds", () => {
  it("trims, removes empty values, deduplicates, and preserves order", () => {
    expect(normalizeGatewayIds([" second ", "", "first", "second", " "])).toEqual([
      "second",
      "first",
    ]);
  });
});

describe("getOAuthStatuses", () => {
  it("returns immediately for empty input", async () => {
    const request = vi.fn();
    server.use(
      http.get("*/api/oauth/status", () => {
        request();
        return HttpResponse.json({});
      }),
    );

    await expect(getOAuthStatuses([])).resolves.toEqual({ statuses: {}, failures: {} });
    expect(request).not.toHaveBeenCalled();
  });

  it("deduplicates IDs, URL-encodes them, and keeps 100 IDs in one request", async () => {
    const seen: string[][] = [];
    const ids = Array.from({ length: 99 }, (_, index) => `gateway-${index}`);
    ids.push("gateway with spaces");

    server.use(
      http.get("*/api/oauth/status", ({ request }) => {
        seen.push(new URL(request.url).searchParams.getAll("gateway_ids"));
        return HttpResponse.json({});
      }),
    );

    await getOAuthStatuses([...ids, "gateway with spaces", " "]);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(100);
    expect(seen[0]).toContain("gateway with spaces");
  });

  it("chunks 201 IDs and preserves successful batches when one batch fails", async () => {
    const batchSizes: number[] = [];
    server.use(
      http.get("*/api/oauth/status", ({ request }) => {
        const ids = new URL(request.url).searchParams.getAll("gateway_ids");
        batchSizes.push(ids.length);
        if (ids[0] === "gateway-100") {
          return HttpResponse.json({ detail: "failed" }, { status: 500 });
        }
        return HttpResponse.json(
          Object.fromEntries(
            ids.map((id) => [
              id,
              {
                oauth_enabled: true,
                grant_type: "authorization_code",
                user_token_status: { status: "valid", authorized: true },
              },
            ]),
          ),
        );
      }),
    );

    const result = await getOAuthStatuses(
      Array.from({ length: 201 }, (_, index) => `gateway-${index}`),
    );

    expect(batchSizes).toEqual([100, 100, 1]);
    expect(Object.keys(result.statuses)).toHaveLength(101);
    expect(result.statuses["gateway-0"]?.user_token_status?.status).toBe("valid");
    expect(result.statuses["gateway-200"]?.user_token_status?.status).toBe("valid");
    expect(Object.keys(result.failures)).toHaveLength(100);
    expect(result.failures["gateway-100"]).toEqual({ retryable: true, status: 500 });
  });

  it("marks a forbidden batch unavailable and non-retryable", async () => {
    server.use(
      http.get("*/api/oauth/status", () =>
        HttpResponse.json({ detail: "forbidden" }, { status: 403 }),
      ),
    );

    await expect(getOAuthStatuses(["gateway-1"])).resolves.toEqual({
      statuses: {},
      failures: { "gateway-1": { retryable: false, status: 403 } },
    });
  });

  it("propagates abort instead of converting it to a batch failure", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(getOAuthStatuses(["gateway-1"], controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
