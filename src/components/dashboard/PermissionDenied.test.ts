import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/client";

import { isPermissionDenied } from "./PermissionDenied";

describe("isPermissionDenied", () => {
  it("matches an ApiError with status 403", () => {
    expect(isPermissionDenied(new ApiError(403, null, "HTTP 403"))).toBe(true);
  });

  it("matches the sanitized query-error shape useQuery stores", () => {
    expect(isPermissionDenied({ message: "HTTP 403", status: 403 })).toBe(true);
  });

  it("rejects other statuses and non-errors", () => {
    expect(isPermissionDenied(new ApiError(500, null, "HTTP 500"))).toBe(false);
    expect(isPermissionDenied({ status: 500 })).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
    expect(isPermissionDenied(undefined)).toBe(false);
    expect(isPermissionDenied("403")).toBe(false);
  });
});
