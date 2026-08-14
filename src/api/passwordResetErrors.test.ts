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

  it("preserves 400 detail without guessing its meaning from wording", () => {
    const detail = "El enlace ya no es válido";
    expect(classifyPasswordResetError(new ApiError(400, { detail }, "HTTP 400"))).toEqual({
      kind: "badRequest",
      message: detail,
    });
  });

  it("handles a 400 without detail", () => {
    expect(classifyPasswordResetError(new ApiError(400, null, "HTTP 400"))).toEqual({
      kind: "badRequest",
      message: null,
    });
  });
});
