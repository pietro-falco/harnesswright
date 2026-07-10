#!/usr/bin/env node
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { runDoctor } from "./doctor.ts";
import { emit } from "./emit.ts";
import { runGate } from "./gate.ts";
import { runNext } from "./next.ts";
import { plan } from "./plan.ts";
import { renderTemplates } from "./templates.ts";

const USAGE = `harnesswright — governance-first, verification-first harness generator

Usage:
  harnesswright init [--yes] [--dry-run] [--force]
  harnesswright gate [slice-id]
  harnesswright doctor
  harnesswright next [--json]

Options:
  --yes        Apply the plan without confirmation
  --dry-run    Print the plan and exit without writing anything
  --force      Overwrite files that already exist
  --json       Emit machine-readable JSON (next only)`;

function runInitCommand(args: string[]): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args,
      options: {
        yes: { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 2;
  }

  const yes = Boolean(parsed.values.yes);
  const dryRun = Boolean(parsed.values["dry-run"]);
  const force = Boolean(parsed.values.force);

  const cwd = process.cwd();
  const project = basename(cwd);
  const specs = renderTemplates(project);
  const existing = new Set(specs.filter((s) => existsSync(join(cwd, s.path))).map((s) => s.path));
  const entries = plan(specs, existing, force);

  for (const entry of entries) {
    process.stdout.write(`${entry.action} ${entry.path}\n`);
  }

  if (dryRun) {
    return 0;
  }

  if (!yes) {
    process.stdout.write("Run again with --yes to apply.\n");
    return 0;
  }

  const summary = emit(entries, specs, cwd);
  process.stdout.write(
    `created: ${summary.created}, skipped: ${summary.skipped}, overwritten: ${summary.overwritten}\n`,
  );
  return 0;
}

function runNextCommand(args: string[]): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args,
      options: {
        json: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 2;
  }

  const json = Boolean(parsed.values.json);
  return runNext(process.cwd(), json);
}

export function main(argv: string[]): number {
  const [cmd, ...rest] = argv;

  if (cmd === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  if (cmd === "init") {
    return runInitCommand(rest);
  }

  if (cmd === "gate") {
    return process.exit(runGate(rest[0], process.cwd()));
  }

  if (cmd === "doctor") {
    return runDoctor(process.cwd());
  }

  if (cmd === "next") {
    return runNextCommand(rest);
  }

  process.stderr.write(`unknown command: ${cmd}\n${USAGE}\n`);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
