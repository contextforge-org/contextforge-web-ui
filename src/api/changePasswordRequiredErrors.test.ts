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

  it("falls back to failed for a non-ApiError", () => {
    expect(classifyChangePasswordRequiredError(new Error("network"))).toEqual({ kind: "failed" });
  });
});
