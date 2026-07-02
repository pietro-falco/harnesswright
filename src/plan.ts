import type { FileSpec } from "./templates.ts";

export type PlanAction = "create" | "skip" | "overwrite";
export type PlanEntry = { path: string; action: PlanAction };

export function plan(specs: FileSpec[], existing: ReadonlySet<string>, force: boolean): PlanEntry[] {
  return specs
    .map((spec): PlanEntry => {
      if (existing.has(spec.path)) {
        return { path: spec.path, action: force ? "overwrite" : "skip" };
      }
      return { path: spec.path, action: "create" };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
