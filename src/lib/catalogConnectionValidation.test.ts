import { describe, expect, it } from "vitest";
import type { CatalogServer } from "@/generated/types";
import { catalogTestAction } from "./catalogConnectionValidation";

const server = { auth_type: "OAuth", is_registered: true, gateway_id: "gateway" } as CatalogServer;
const options = { canTest: true, canUpdate: true, canValidate: true, pending: false };

describe("Catalog connection test policy", () => {
  it.each([
    ["no read permission", { canTest: false }, "hidden"],
    ["read-only OAuth caller", { canUpdate: false }, "hidden"],
    ["ineligible gateway or token", { canValidate: false }, "disabled"],
    ["another action pending", { pending: true }, "disabled"],
    ["eligible gateway", {}, "enabled"],
  ] as const)("handles %s", (_name, changes, availability) => {
    expect(catalogTestAction(server, { ...options, ...changes })).toEqual({
      kind: "oauth",
      availability,
    });
  });

  it("keeps client-credentials OAuth on the generic test without update permission", () => {
    expect(
      catalogTestAction(server, {
        ...options,
        canUpdate: false,
        canValidate: false,
        status: { state: "not_applicable", status: { oauth_enabled: true } },
      }),
    ).toEqual({ kind: "generic", availability: "enabled" });
  });

  it("keeps non-OAuth tests available independently of OAuth eligibility", () => {
    expect(
      catalogTestAction(
        { ...server, auth_type: "Open" },
        {
          ...options,
          canUpdate: false,
          canValidate: false,
        },
      ),
    ).toEqual({ kind: "generic", availability: "enabled" });
  });

  it("disables tests until required OAuth configuration is saved", () => {
    expect(
      catalogTestAction({ ...server, requires_oauth_config: true }, options).availability,
    ).toBe("disabled");
  });
});
