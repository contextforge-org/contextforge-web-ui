import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { classifyChangePasswordRequiredError } from "./changePasswordRequiredErrors";

describe("classifyChangePasswordRequiredError", () => {
  it.each([
    [401, "invalidOldPassword"],
    [403, "invalidOldPassword"],
    [500, "failed"],
  ])("maps HTTP %s to %s", (status, kind) => {
    expect(
      classifyChangePasswordRequiredError(new ApiError(status, null, `HTTP ${status}`)),
    ).toEqual({
      kind,
    });
  });

  it("preserves 400 detail as a policy-violation message", () => {
    const detail = "Password must not be a commonly used password";
    expect(classifyChangePasswordRequiredError(new ApiError(400, { detail }, "HTTP 400"))).toEqual({
      kind: "policyViolation",
      message: detail,
    });
  });

  it("preserves 422 detail as a policy-violation message", () => {
    const detail = "Password too short";
    expect(classifyChangePasswordRequiredError(new ApiError(422, { detail }, "HTTP 422"))).toEqual({
      kind: "policyViolation",
      message: detail,
    });
  });

  it("unwraps the double-JSON-encoded detail the BFF route actually forwards (raw upstream response text)", () => {
    // server/src/routes/auth/change-password-required.ts sends
    // { error: "change_password_failed", detail: await changeResponse.text() } —
    // `detail` here is itself the raw JSON text of upstream's error body.
    const body = {
      error: "change_password_failed",
      detail: JSON.stringify({
        detail: "Password must be at least 22 characters long (privileged account)",
      }),
    };
    expect(classifyChangePasswordRequiredError(new ApiError(400, body, "HTTP 400"))).toEqual({
      kind: "policyViolation",
      message: "Password must be at least 22 characters long (privileged account)",
    });
  });

  it("handles a 400 without detail", () => {
    expect(classifyChangePasswordRequiredError(new ApiError(400, null, "HTTP 400"))).toEqual({
      kind: "policyViolation",
      message: null,
    });
  });

  it("maps a login_after_change_failed body to changedButLoginFailed, ahead of status-based checks", () => {
    const body = { error: "login_after_change_failed" };
    expect(classifyChangePasswordRequiredError(new ApiError(502, body, "HTTP 502"))).toEqual({
      kind: "changedButLoginFailed",
    });
  });

  it("maps a password_change_not_required body to notRequired, not invalidOldPassword, despite the shared 403 status", () => {
    const body = { error: "password_change_not_required" };
    expect(classifyChangePasswordRequiredError(new ApiError(403, body, "HTTP 403"))).toEqual({
      kind: "notRequired",
    });
  });

  it("falls back to invalidOldPassword for a 403 without the password_change_not_required body", () => {
    expect(classifyChangePasswordRequiredError(new ApiError(403, null, "HTTP 403"))).toEqual({
      kind: "invalidOldPassword",
    });
  });

  it("falls back to failed for a non-ApiError", () => {
    expect(classifyChangePasswordRequiredError(new Error("network"))).toEqual({ kind: "failed" });
  });
});
