import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { classifyPasswordResetError } from "./passwordResetErrors";

describe("classifyPasswordResetError", () => {
  it.each([
    [403, "disabled"],
    [410, "expired"],
    [429, "rateLimited"],
    [500, "failed"],
  ])("maps HTTP %s to %s", (status, kind) => {
    expect(classifyPasswordResetError(new ApiError(status, null, `HTTP ${status}`))).toEqual({
      kind,
    });
  });

  it("preserves actionable backend password-policy detail", () => {
    const detail = "Password must contain at least 3 character types";
    expect(classifyPasswordResetError(new ApiError(400, { detail }, "HTTP 400"))).toEqual({
      kind: "validation",
      message: detail,
    });
  });

  it("uses invalid fallback when a 400 has no safe detail", () => {
    expect(classifyPasswordResetError(new ApiError(400, null, "HTTP 400"))).toEqual({
      kind: "invalid",
    });
  });

  it("classifies token detail as an invalid link rather than password validation", () => {
    expect(
      classifyPasswordResetError(
        new ApiError(400, { detail: "This reset link is invalid" }, "HTTP 400"),
      ),
    ).toEqual({ kind: "invalid" });
  });
});
