import { describe, expect, it } from "vitest";

import {
  alignToGrid,
  buildGrid,
  headlineScalar,
  isEmptySeries,
  toLinePoints,
} from "./sparklineSeries";

const HOUR_MS = 3_600_000;

describe("buildGrid", () => {
  it("returns one slot per interval, ending with the in-progress bucket", () => {
    const now = Date.parse("2026-09-01T12:34:56Z");
    const grid = buildGrid(now, 24, 60);

    expect(grid).toHaveLength(24);
    expect(grid[23]).toBe(Date.parse("2026-09-01T12:00:00Z"));
    expect(grid[0]).toBe(Date.parse("2026-08-31T13:00:00Z"));
  });

  it("floors slots to interval boundaries, matching the server's bucketing", () => {
    const grid = buildGrid(Date.parse("2026-09-01T12:59:59Z"), 3, 60);
    expect(grid.every((slot) => slot % HOUR_MS === 0)).toBe(true);
  });

  it("returns nothing for a non-positive window or interval", () => {
    expect(buildGrid(Date.now(), 0, 60)).toEqual([]);
    expect(buildGrid(Date.now(), 24, 0)).toEqual([]);
  });
});

describe("alignToGrid", () => {
  const now = Date.parse("2026-09-01T12:00:00Z");
  const grid = buildGrid(now, 4, 60); // 09:00, 10:00, 11:00, 12:00

  it("places a sparse bucket at its real slot rather than at the start", () => {
    const result = alignToGrid(["2026-09-01T11:00:00Z"], [7], grid, "zero");
    expect(result).toEqual([0, 0, 7, 0]);
  });

  it("fills count gaps with zero and latency gaps with null", () => {
    expect(alignToGrid([], [], grid, "zero")).toEqual([0, 0, 0, 0]);
    expect(alignToGrid([], [], grid, "gap")).toEqual([null, null, null, null]);
  });

  it("matches buckets that are not floored to the interval", () => {
    const result = alignToGrid(["2026-09-01T10:30:00Z"], [3], grid, "zero");
    expect(result).toEqual([0, 3, 0, 0]);
  });

  it("drops buckets outside the window instead of shifting the series", () => {
    const result = alignToGrid(
      ["2026-08-30T09:00:00Z", "2026-09-01T12:00:00Z"],
      [99, 4],
      grid,
      "zero",
    );
    expect(result).toEqual([0, 0, 0, 4]);
  });

  it("ignores unparseable timestamps and non-finite values", () => {
    const result = alignToGrid(
      ["not-a-date", "2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z"],
      [1, Number.NaN, 5],
      grid,
      "zero",
    );
    expect(result).toEqual([0, 0, 5, 0]);
  });

  it("returns nothing for an empty grid", () => {
    expect(alignToGrid(["2026-09-01T11:00:00Z"], [7], [], "zero")).toEqual([]);
  });
});

describe("headlineScalar", () => {
  it("sums the window for counts", () => {
    expect(headlineScalar([1, 0, 2, 0], "sum")).toBe(3);
  });

  it("takes the most recent populated slot for percentiles", () => {
    expect(headlineScalar([null, 0.5, 0.317, null], "latest")).toBe(0.317);
  });

  it("is null when the window holds no data", () => {
    expect(headlineScalar([null, null], "latest")).toBeNull();
    expect(headlineScalar([], "sum")).toBeNull();
  });

  it("treats a zero-filled count window as zero, not unavailable", () => {
    expect(headlineScalar([0, 0, 0], "sum")).toBe(0);
  });
});

describe("toLinePoints", () => {
  it("flattens idle slots to zero so the line spans the whole window", () => {
    expect(toLinePoints([null, 0.5, null, 0.3])).toEqual([0, 0.5, 0, 0.3]);
  });

  it("leaves a gapless series untouched", () => {
    expect(toLinePoints([0, 2, 5])).toEqual([0, 2, 5]);
  });

  it("returns the same length as its input, which is what keeps rows aligned", () => {
    const points = Array.from({ length: 24 }, (_, i) => (i === 23 ? 4 : null));
    expect(toLinePoints(points)).toHaveLength(24);
  });
});

describe("isEmptySeries", () => {
  it("is true when every slot is empty or zero", () => {
    expect(isEmptySeries([0, 0, 0])).toBe(true);
    expect(isEmptySeries([null, null])).toBe(true);
  });

  it("is false as soon as one slot carries a value", () => {
    expect(isEmptySeries([0, 0, 1])).toBe(false);
  });
});
