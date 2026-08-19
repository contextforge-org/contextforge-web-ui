import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { classifyLoginError } from "./loginErrors";

describe("classifyLoginError", () => {
  it("maps 401 to invalidCredentials regardless of body", () => {
    expect(classifyLoginError(new ApiError(401, null, "HTTP 401"))).toEqual({
      kind: "invalidCredentials",
    });
  });

  it("detects password-change-required from a double-JSON-encoded 403 detail", () => {
    const body = {
      error: "login_failed",
      detail: JSON.stringify({
        detail: "Password change required. Please change your password before continuing.",
      }),
    };
    expect(classifyLoginError(new ApiError(403, body, "HTTP 403"))).toEqual({
      kind: "passwordChangeRequired",
    });
  });

  it("falls back to failed for an unrelated 403", () => {
    const body = { error: "login_failed", detail: JSON.stringify({ detail: "Forbidden" }) };
    expect(classifyLoginError(new ApiError(403, body, "HTTP 403"))).toEqual({
      kind: "failed",
      status: 403,
    });
  });

  it("does not throw on non-JSON detail (e.g. a plain-text 429 body)", () => {
    const body = { error: "login_failed", detail: "Too many requests" };
    expect(classifyLoginError(new ApiError(429, body, "HTTP 429"))).toEqual({
      kind: "failed",
      status: 429,
    });
  });

  it("falls back to failed for a malformed/missing body or non-ApiError", () => {
    expect(classifyLoginError(new ApiError(403, null, "HTTP 403"))).toEqual({
      kind: "failed",
      status: 403,
    });
    expect(classifyLoginError(new Error("network"))).toEqual({ kind: "failed", status: 0 });
  });
});
