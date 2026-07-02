import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PlanEntry } from "./plan.ts";
import type { FileSpec } from "./templates.ts";

export type EmitSummary = { created: number; skipped: number; overwritten: number };

export function emit(entries: PlanEntry[], specs: FileSpec[], root: string): EmitSummary {
  const contentByPath = new Map(specs.map((s) => [s.path, s.content]));
  const summary: EmitSummary = { created: 0, skipped: 0, overwritten: 0 };

  for (const entry of entries) {
    if (entry.action === "skip") {
      summary.skipped += 1;
      continue;
    }

    const content = contentByPath.get(entry.path);
    if (content === undefined) {
      throw new Error(`no template content for path: ${entry.path}`);
    }

    const fullPath = join(root, entry.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);

    if (entry.action === "create") {
      summary.created += 1;
    } else {
      summary.overwritten += 1;
    }
  }

  return summary;
}
