import { describe, it, expect } from "vitest";
import { OAuthAuthorizationError } from "@/api/servers";
import type { MCPServer } from "@/types/server";
import type { OAuthStatusEntry } from "@/api/oauth";
import { createIntl, createIntlCache } from "react-intl";
import en from "@/i18n/locales/en-US/mcpServer.json";
import es from "@/i18n/locales/es-ES/mcpServer.json";
import pt from "@/i18n/locales/pt-BR/mcpServer.json";
import {
  canValidateOAuthConnection,
  oauthConfigurationKey,
  oauthErrorMessage,
  oauthAuthorizationErrorMessage,
} from "./oauthConnectionValidation";

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

  it.each([
    ["valid", true],
    ["near_expiry", true],
    ["expired", false],
    ["missing", false],
  ] as const)("allows stored-token validation for %s: %s", (tokenStatus, expected) => {
    const status: OAuthStatusEntry = {
      state: "ready",
      tokenStatus,
      status: { oauth_enabled: true },
    };
    expect(canValidateOAuthConnection({ ...gateway, authType: "OAuth" }, status)).toBe(expected);
  });
});

describe("OAuth error guidance", () => {
  it.each([
    ["en-US", en],
    ["es-ES", es],
    ["pt-BR", pt],
  ] as const)(
    "localizes supported provider and token validation errors in %s",
    (locale, messages) => {
      const intl = createIntl({ locale, messages }, createIntlCache());
      for (const code of [
        "invalid_grant",
        "unsupported_grant_type",
        "login_required",
        "consent_required",
        "interaction_required",
        "account_selection_required",
        "invalid_request_uri",
        "invalid_request_object",
        "request_not_supported",
        "request_uri_not_supported",
        "registration_not_supported",
        "token_validation_failed",
      ]) {
        const key = `mcpServer.oauthValidation.error.${code}` as keyof typeof messages;
        expect(messages[key]).toBeTruthy();
        expect(oauthErrorMessage(intl, code)).toBe(messages[key]);
        expect(oauthErrorMessage(intl, code)).not.toBe(
          messages["mcpServer.oauthValidation.error.generic"],
        );
      }
      expect(oauthErrorMessage(intl, "unsafe upstream details")).toBe(
        messages["mcpServer.oauthValidation.error.generic"],
      );
    },
  );
});

describe("OAuth authorization error details", () => {
  const intl = createIntl({ locale: "en-US", messages: en }, createIntlCache());

  it.each(["access_denied", "unlisted_provider_error"])(
    "preserves provider context for %s with localized guidance",
    (code) => {
      const error = new OAuthAuthorizationError(code, "Contact your organization administrator");
      expect(oauthAuthorizationErrorMessage(intl, error)).toBe(
        `${oauthErrorMessage(intl, code)} Provider message: Contact your organization administrator`,
      );
    },
  );

  it("omits empty and duplicate descriptions", () => {
    const guidance = oauthErrorMessage(intl, "access_denied");
    for (const description of [undefined, "", guidance]) {
      expect(
        oauthAuthorizationErrorMessage(
          intl,
          new OAuthAuthorizationError("access_denied", description),
        ),
      ).toBe(guidance);
    }
  });
});
