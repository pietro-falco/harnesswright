import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseHarnessConfig } from "./harness.ts";
import { schedule, type ScheduleResult } from "./schedule.ts";
import { effectiveModel, isModeBEligible, parseSpec, type Spec, type SpecBudget } from "./spec.ts";

type SpecReport = {
  mode: "A" | "B";
  status: "proposed" | "accepted";
  effort: "low" | "high";
  efficiency: string[];
  budget: SpecBudget;
  stop_conditions: string[];
  criteria: string[];
  scope?: string[];
  model: string;
  model_source: "declared" | "effort-default";
};

type NextReport =
  | (Extract<ScheduleResult, { kind: "unlocked" }> & {
      locked: boolean;
      eligible_mode_b: boolean;
      spec?: SpecReport;
    })
  | Extract<ScheduleResult, { kind: "all-passed" }>;

function buildSpecReport(spec: Spec): SpecReport {
  const { model, model_source } = effectiveModel(spec);
  return {
    mode: spec.mode,
    status: spec.status,
    effort: spec.effort,
    efficiency: spec.efficiency,
    budget: spec.budget,
    stop_conditions: spec.stop_conditions,
    criteria: spec.criteria,
    ...(spec.scope !== undefined ? { scope: spec.scope } : {}),
    model,
    model_source,
  };
}

function formatHuman(report: NextReport): string {
  if (report.kind === "all-passed") {
    return `all ${report.totalCount} slice(s) passed\n`;
  }

  const lines: string[] = [];
  lines.push(`unlocked: ${report.id}${report.title !== undefined ? ` — ${report.title}` : ""}`);
  lines.push(`manifest: ${report.manifest}`);
  if (report.criteria !== undefined) {
    lines.push("criteria:");
    for (const criterion of report.criteria) {
      lines.push(`  - ${criterion}`);
    }
  }

  if (report.spec !== undefined) {
    const spec = report.spec;
    lines.push(`spec: mode ${spec.mode}, ${spec.status}, effort ${spec.effort}`);
    lines.push(`model: ${spec.model} (${spec.model_source})`);
    if (spec.scope !== undefined) {
      lines.push(`scope: ${spec.scope.join(", ")}`);
    }
    lines.push(`locked: ${report.locked ? "yes" : "no"}`);
    lines.push(`eligible (mode B): ${report.eligible_mode_b ? "yes" : "no"}`);
  }

  lines.push(`passed ${report.passedCount}/${report.totalCount}`);

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

  const write = (report: NextReport): number => {
    process.stdout.write(json ? `${JSON.stringify(report)}\n` : formatHuman(report));
    return 0;
  };

  const result = schedule(config);
  if (result.kind === "all-passed") {
    return write(result);
  }

  const specPath = `.harness/specs/${result.id}.md`;
  const specFile = join(cwd, specPath);

  let spec: Spec | null = null;
  if (existsSync(specFile)) {
    try {
      spec = parseSpec(readFileSync(specFile, "utf8"));
    } catch (err) {
      process.stderr.write(`${specPath}: ${(err as Error).message}\n`);
      return 2;
    }
  }

  // A lock is a fact of presence only (ADR-004 D2); its content is audit-only and never parsed.
  const locked = existsSync(join(cwd, `.harness/locks/${result.id}.lock`));

  return write({
    ...result,
    locked,
    eligible_mode_b: isModeBEligible(spec, locked),
    ...(spec !== null ? { spec: buildSpecReport(spec) } : {}),
  });
}
