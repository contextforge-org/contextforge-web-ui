import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";
import { ApiError } from "./client";
import { rulesApi, type RbacRule } from "./rules";

const rule: RbacRule = {
  id: "rule-1",
  name: "deny-viewer-tools",
  description: "",
  capability_type: "tool",
  capability_id: null,
  permission: "tools.read",
  phase: "pre_invocation",
  predicate: "role.viewer",
  effect: "deny",
  priority: 100,
  is_active: true,
  is_system: false,
  created_by: "admin@example.com",
  created_at: "2026-10-03T00:00:00Z",
  updated_at: null,
};

describe("rulesApi.list", () => {
  it("GETs /api/rbac/rules with capability filters", async () => {
    let path = "";
    server.use(
      http.get("*/api/rbac/rules", ({ request }) => {
        path = new URL(request.url).search;
        return HttpResponse.json([rule]);
      }),
    );

    const result = await rulesApi.list({ capabilityType: "tool", capabilityId: "tool-42" });

    expect(path).toBe("?capability_type=tool&capability_id=tool-42");
    expect(result).toEqual([rule]);
  });

  it("omits the query when unfiltered", async () => {
    let path = "";
    server.use(
      http.get("*/api/rbac/rules", ({ request }) => {
        path = new URL(request.url).search;
        return HttpResponse.json([]);
      }),
    );

    await rulesApi.list();
    expect(path).toBe("");
  });
});

describe("rulesApi.create", () => {
  it("POSTs the rule body", async () => {
    let body: unknown;
    server.use(
      http.post("*/api/rbac/rules", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(rule, { status: 201 });
      }),
    );

    const result = await rulesApi.create({
      name: "deny-viewer-tools",
      capability_type: "tool",
      predicate: "role.viewer",
      effect: "deny",
    });

    expect(body).toMatchObject({
      name: "deny-viewer-tools",
      capability_type: "tool",
      effect: "deny",
    });
    expect(result.id).toBe("rule-1");
  });

  it("surfaces the gateway 422 detail for an invalid predicate", async () => {
    server.use(
      http.post("*/api/rbac/rules", () =>
        HttpResponse.json(
          { detail: "Invalid predicate: Unexpected character ';' at 7" },
          { status: 422 },
        ),
      ),
    );

    await expect(
      rulesApi.create({
        name: "bad",
        capability_type: "tool",
        predicate: "role.hr; DROP TABLE",
        effect: "deny",
      }),
    ).rejects.toMatchObject({
      status: 422,
      body: { detail: expect.stringContaining("Invalid predicate") },
    } satisfies Partial<ApiError>);
  });
});

describe("rulesApi.update", () => {
  it("PATCHes editable fields", async () => {
    let body: unknown;
    server.use(
      http.patch("*/api/rbac/rules/:id", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...rule, priority: 5 });
      }),
    );

    const result = await rulesApi.update("rule-1", { priority: 5 });

    expect(body).toEqual({ priority: 5 });
    expect(result.priority).toBe(5);
  });
});

describe("rulesApi.remove", () => {
  it("DELETEs by id", async () => {
    let called = false;
    server.use(
      http.delete("*/api/rbac/rules/:id", () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await rulesApi.remove("rule-1");
    expect(called).toBe(true);
  });

  it("rejects with 409 for system rows", async () => {
    server.use(
      http.delete("*/api/rbac/rules/:id", () =>
        HttpResponse.json({ detail: "System rules cannot be deleted" }, { status: 409 }),
      ),
    );

    await expect(rulesApi.remove("rule-1")).rejects.toMatchObject({ status: 409 });
  });
});

describe("rulesApi.entitySummary", () => {
  it("GETs the summary with both query parameters", async () => {
    let path = "";
    server.use(
      http.get("*/api/rbac/rules/entity-summary", ({ request }) => {
        path = new URL(request.url).search;
        return HttpResponse.json({
          rules: [rule],
          inherited: [],
          defaults: { viewer: ["tools.read"] },
        });
      }),
    );

    const result = await rulesApi.entitySummary("tool", "tool/42");

    expect(path).toBe("?capability_type=tool&capability_id=tool%2F42");
    expect(result.rules).toHaveLength(1);
    expect(result.defaults).toEqual({ viewer: ["tools.read"] });
  });
});
