import { describe, expect, it } from "vitest";

import { __test__ } from "./metrics";

const { buildQuery, clampInt } = __test__;

describe("clampInt", () => {
  it("passes through an in-range value", () => {
    expect(clampInt(24, 1, 168)).toBe(24);
  });

  it("clamps to the server's bounds", () => {
    expect(clampInt(0, 1, 168)).toBe(1);
    expect(clampInt(9999, 1, 168)).toBe(168);
  });

  it("floors fractional values", () => {
    expect(clampInt(24.9, 1, 168)).toBe(24);
  });

  it("drops values the server cannot parse", () => {
    expect(clampInt(undefined, 1, 168)).toBeUndefined();
    expect(clampInt(Number.NaN, 1, 168)).toBeUndefined();
    expect(clampInt(Infinity, 1, 168)).toBeUndefined();
  });
});

describe("buildQuery", () => {
  it("returns an empty string when no params are given, deferring to the server defaults", () => {
    expect(buildQuery({})).toBe("");
  });

  it("omits a param that clamped away and keeps the other", () => {
    expect(buildQuery({ hours: 24, intervalMinutes: Number.NaN })).toBe("?hours=24");
    expect(buildQuery({ intervalMinutes: 60 })).toBe("?interval_minutes=60");
  });

  it("serialises both params with the server's snake_case names", () => {
    expect(buildQuery({ hours: 24, intervalMinutes: 60 })).toBe("?hours=24&interval_minutes=60");
  });
});
