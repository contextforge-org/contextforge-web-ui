import { describe, expect, it } from "vitest";

import type { OAuthStatusEntry } from "@/hooks/useOAuthStatuses";
import {
  getServerAvailability,
  isAuthorizationAvailability,
  needsOAuthAuthorization,
} from "./serverStatus";

const connected = { enabled: true, reachable: true };

function ready(tokenStatus: "valid" | "near_expiry" | "expired" | "missing"): OAuthStatusEntry {
  return {
    state: "ready",
    tokenStatus,
    status: {
      oauth_enabled: true,
      grant_type: "authorization_code",
      user_token_status: { status: tokenStatus, authorized: tokenStatus === "valid" },
    },
  };
}

describe("server OAuth status precedence", () => {
  it.each([
    [ready("missing"), "authorization_required"],
    [ready("expired"), "authorization_expired"],
    [ready("near_expiry"), "authorization_expiring"],
    [{ state: "loading" } satisfies OAuthStatusEntry, "authorization_checking"],
    [
      { state: "unavailable", retryable: true } satisfies OAuthStatusEntry,
      "authorization_unavailable",
    ],
  ])("uses OAuth state before connectivity", (oauthStatus, expected) => {
    expect(getServerAvailability(connected, oauthStatus)).toBe(expected);
  });

  it("keeps valid and non-applicable OAuth on existing lifecycle status", () => {
    expect(getServerAvailability({ enabled: true, reachable: false }, ready("valid"))).toBe(
      "checking",
    );
    expect(
      getServerAvailability(
        { enabled: false, reachable: true },
        {
          state: "not_applicable",
          status: { oauth_enabled: true, grant_type: "client_credentials" },
        },
      ),
    ).toBe("inactive");
  });

  it.each([
    [{ state: "loading" } satisfies OAuthStatusEntry, "authorization_checking"],
    [
      { state: "unavailable", retryable: true } satisfies OAuthStatusEntry,
      "authorization_unavailable",
    ],
  ])("keeps caller authorization state visible for a disabled server", (oauthStatus, expected) => {
    expect(getServerAvailability({ enabled: false, reachable: false }, oauthStatus)).toBe(expected);
  });

  it("offers authorization only for missing and expired tokens", () => {
    expect(needsOAuthAuthorization(getServerAvailability(connected, ready("missing")))).toBe(true);
    expect(needsOAuthAuthorization(getServerAvailability(connected, ready("expired")))).toBe(true);
    expect(needsOAuthAuthorization(getServerAvailability(connected, ready("near_expiry")))).toBe(
      false,
    );
  });

  it("identifies only authorization availability states", () => {
    expect(isAuthorizationAvailability("authorization_required")).toBe(true);
    expect(isAuthorizationAvailability("authorization_expired")).toBe(true);
    expect(isAuthorizationAvailability("authorization_expiring")).toBe(true);
    expect(isAuthorizationAvailability("authorization_checking")).toBe(true);
    expect(isAuthorizationAvailability("authorization_unavailable")).toBe(true);
    expect(isAuthorizationAvailability("active")).toBe(false);
    expect(isAuthorizationAvailability("unreachable")).toBe(false);
    expect(isAuthorizationAvailability("checking")).toBe(false);
    expect(isAuthorizationAvailability("inactive")).toBe(false);
  });
});
