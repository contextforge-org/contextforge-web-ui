import { describe, it, expect } from "vitest";
import type { MCPServer } from "@/types/server";
import { canValidateOAuthConnection, oauthConfigurationKey } from "./oauthConnectionValidation";

const gateway = {
  url: "https://saved.example/mcp",
  transport: "STREAMABLEHTTP",
  enabled: true,
  authType: "oauth",
  oauthConfig: { grant_type: "authorization_code", nested: { a: 1, b: 2 } },
} as unknown as MCPServer;
describe("OAuth validation eligibility and configuration", () => {
  it("ignores object key order but detects saved changes", () => {
    expect(oauthConfigurationKey(gateway)).toBe(
      oauthConfigurationKey({
        ...gateway,
        oauthConfig: { nested: { b: 2, a: 1 }, grant_type: "authorization_code" },
      }),
    );
    expect(oauthConfigurationKey(gateway)).not.toBe(
      oauthConfigurationKey({ ...gateway, url: "https://changed.example/mcp" }),
    );
  });
  it("requires an enabled authorization-code gateway and usable authorization", () => {
    const status = {
      state: "ready",
      tokenStatus: "valid",
      status: { oauth_enabled: true },
    } as const;
    expect(canValidateOAuthConnection(gateway, status)).toBe(true);
    expect(canValidateOAuthConnection({ ...gateway, enabled: false }, status)).toBe(false);
    expect(
      canValidateOAuthConnection(
        { ...gateway, oauthConfig: { grant_type: "client_credentials" } },
        status,
      ),
    ).toBe(false);
    expect(canValidateOAuthConnection(gateway)).toBe(false);
  });
});
