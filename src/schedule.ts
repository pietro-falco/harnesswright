import type { HarnessConfig, HarnessSlice } from "./harness.ts";

export type ScheduleResult =
  | {
      kind: "unlocked";
      id: string;
      title?: string;
      manifest: string;
      criteria?: string[];
      passedCount: number;
      totalCount: number;
    }
  | { kind: "all-passed"; totalCount: number };

function numericSuffix(id: string): number | null {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function compareSliceIds(a: string, b: string): number {
  const na = numericSuffix(a);
  const nb = numericSuffix(b);
  if (na !== null && nb !== null) return na - nb;
  if (na !== null) return -1;
  if (nb !== null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function schedule(config: HarnessConfig): ScheduleResult {
  const sorted = Object.entries(config.slices).sort((a, b) => compareSliceIds(a[0], b[0]));
  const totalCount = sorted.length;
  const passedCount = sorted.filter(([, slice]) => slice.status === "passed").length;

  for (const [id, slice] of sorted) {
    if (slice.status !== "passed") {
      return buildUnlocked(id, slice, passedCount, totalCount);
    }
  }

  return { kind: "all-passed", totalCount };
}

function buildUnlocked(
  id: string,
  slice: HarnessSlice,
  passedCount: number,
  totalCount: number,
): ScheduleResult {
  return {
    kind: "unlocked",
    id,
    manifest: slice.manifest,
    passedCount,
    totalCount,
    ...(slice.title !== undefined ? { title: slice.title } : {}),
    ...(slice.criteria !== undefined ? { criteria: slice.criteria } : {}),
  };
}
