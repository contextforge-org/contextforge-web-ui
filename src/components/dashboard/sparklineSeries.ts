/**
 * Aligns the sparse metrics buckets onto an evenly spaced grid, so a busy hour
 * lands at its real position in the window rather than beside its neighbours.
 *
 * Counts fill gaps with 0. Latencies fill with `null`, which keeps idle hours
 * out of the headline number; `toLinePoints` flattens them to 0 for drawing.
 */

/** How a slot with no server-side bucket is represented. */
export type FillMode = "zero" | "gap";

/** How the row's single headline number is derived from the window. */
export type ScalarMode = "sum" | "latest";

const MS_PER_MINUTE = 60_000;

/**
 * Grid slot start times (epoch ms, ascending), ending with the in-progress
 * bucket. Floored to interval boundaries to match the server's
 * `floor(epoch / interval) * interval`.
 */
export function buildGrid(nowMs: number, hours: number, intervalMinutes: number): number[] {
  const intervalMs = intervalMinutes * MS_PER_MINUTE;
  if (intervalMs <= 0 || hours <= 0) return [];

  const slotCount = Math.ceil((hours * 60) / intervalMinutes);
  const current = Math.floor(nowMs / intervalMs) * intervalMs;

  return Array.from({ length: slotCount }, (_, i) => current - (slotCount - 1 - i) * intervalMs);
}

/**
 * Map a sparse `buckets`/`values` pair onto `grid`, one entry per slot.
 *
 * Both sides are floored to the interval before matching, so the PostgreSQL
 * and Python bucketing paths align identically. Buckets outside the grid and
 * unparseable timestamps are dropped rather than shifting the series.
 */
export function alignToGrid(
  buckets: string[],
  values: number[],
  grid: number[],
  fill: FillMode,
): (number | null)[] {
  const empty = fill === "zero" ? 0 : null;
  if (grid.length === 0) return [];

  const intervalMs = grid.length > 1 ? grid[1] - grid[0] : 0;
  const bySlot = new Map<number, number>();

  for (let i = 0; i < buckets.length; i += 1) {
    const value = values[i];
    if (value === undefined || !Number.isFinite(value)) continue;

    const parsed = new Date(buckets[i]).getTime();
    if (Number.isNaN(parsed)) continue;

    const slot = intervalMs > 0 ? Math.floor(parsed / intervalMs) * intervalMs : parsed;
    bySlot.set(slot, value);
  }

  return grid.map((slot) => bySlot.get(slot) ?? empty);
}

/**
 * The single number shown beside the row. `sum` totals the window; `latest`
 * takes the most recent populated slot, used for percentiles because averaging
 * per-bucket percentiles does not yield a percentile.
 *
 * Null when the window holds no data, which formatters render as `—`.
 */
export function headlineScalar(points: (number | null)[], mode: ScalarMode): number | null {
  const present = points.filter((p): p is number => p !== null);
  if (present.length === 0) return null;

  if (mode === "sum") return present.reduce((total, p) => total + p, 0);

  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    if (point !== null) return point;
  }
  return null;
}

/** One grid slot, carrying both what to draw and what actually happened. */
export interface SparklinePoint {
  /** Bucket start, epoch ms. */
  t: number;
  /** Value for drawing. Idle slots are 0 so the line spans the whole window. */
  line: number;
  /** True value, or null when the slot had no requests. */
  value: number | null;
  /** Requests observed in the slot, used to qualify a percentile. */
  count: number;
}

/**
 * Zip a series against the grid and the per-slot request counts. `line` keeps
 * idle slots drawable; `value` stays null there so the tooltip says "no
 * requests" rather than reporting a fabricated 0.
 */
export function toSparklinePoints(
  grid: number[],
  series: (number | null)[],
  counts: number[],
): SparklinePoint[] {
  return grid.map((t, i) => {
    const value = series[i] ?? null;
    return { t, line: value ?? 0, value, count: counts[i] ?? 0 };
  });
}

/** True when every slot is empty, i.e. nothing to draw. */
export function isEmptySeries(points: (number | null)[]): boolean {
  return points.every((p) => p === null || p === 0);
}
