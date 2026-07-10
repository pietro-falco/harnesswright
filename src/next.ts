import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseHarnessConfig } from "./harness.ts";
import { schedule, type ScheduleResult } from "./schedule.ts";

function formatHuman(result: ScheduleResult): string {
  if (result.kind === "all-passed") {
    return `all ${result.totalCount} slice(s) passed\n`;
  }

  const lines: string[] = [];
  lines.push(`unlocked: ${result.id}${result.title !== undefined ? ` — ${result.title}` : ""}`);
  lines.push(`manifest: ${result.manifest}`);
  if (result.criteria !== undefined) {
    lines.push("criteria:");
    for (const criterion of result.criteria) {
      lines.push(`  - ${criterion}`);
    }
  }
  lines.push(`passed ${result.passedCount}/${result.totalCount}`);

  return `${lines.join("\n")}\n`;
}

export function runNext(cwd: string, json: boolean): number {
  const harnessPath = join(cwd, ".harness/harness.json");
  if (!existsSync(harnessPath)) {
    process.stderr.write("harness config not found: .harness/harness.json\n");
    return 2;
  }

  let config;
  try {
    config = parseHarnessConfig(readFileSync(harnessPath, "utf8"));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 2;
  }

  const result = schedule(config);

  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(formatHuman(result));
  }

  return 0;
}
