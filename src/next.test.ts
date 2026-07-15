import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { runNext } from "./next.ts";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "harnesswright-next-"));
}

function writeHarnessConfig(dir: string, config: unknown): void {
  mkdirSync(join(dir, ".harness"), { recursive: true });
  writeFileSync(join(dir, ".harness/harness.json"), JSON.stringify(config));
}

function writeSpec(dir: string, sliceId: string, frontmatter: string[]): void {
  mkdirSync(join(dir, ".harness/specs"), { recursive: true });
  writeFileSync(
    join(dir, `.harness/specs/${sliceId}.md`),
    ["---", ...frontmatter, "---", "", "# Brief", ""].join("\n"),
  );
}

function writeLock(dir: string, sliceId: string): void {
  mkdirSync(join(dir, ".harness/locks"), { recursive: true });
  writeFileSync(join(dir, `.harness/locks/${sliceId}.lock`), "session-x 2026-07-11T09:00:00Z\n");
}

const MODE_B_SPEC = [
  "mode: B",
  "efficiency: []",
  "effort: high",
  "budget:",
  "  tokens: 200000",
  "stop_conditions:",
  "  - budget-exhaustion",
  "criteria:",
  "  - tests-pass",
  "status: accepted",
  "type: feature",
  "scope:",
  "  - src/spec.ts",
];

function withStatus(status: string): string[] {
  return MODE_B_SPEC.map((line) => (line === "status: accepted" ? `status: ${status}` : line));
}

function singleSliceConfig(): unknown {
  return { version: "0.1", project: "p", slices: { S1: { manifest: ".verity/claims.json" } } };
}

function captureStdout(fn: () => number): { exitCode: number; output: string } {
  const original = process.stdout.write.bind(process.stdout);
  let output = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    const exitCode = fn();
    return { exitCode, output };
  } finally {
    process.stdout.write = original;
  }
}

test("returns 2 when harness config is missing", () => {
  const dir = makeTmpDir();

  const { exitCode } = captureStdout(() => runNext(dir, false));
  assert.equal(exitCode, 2);

  rmSync(dir, { recursive: true, force: true });
});

test("returns 2 when harness config is unparseable", () => {
  const dir = makeTmpDir();
  mkdirSync(join(dir, ".harness"), { recursive: true });
  writeFileSync(join(dir, ".harness/harness.json"), "{ not json");

  const { exitCode } = captureStdout(() => runNext(dir, false));
  assert.equal(exitCode, 2);

  rmSync(dir, { recursive: true, force: true });
});

test("human report for an unlocked slice returns 0 and prints id, manifest, progress", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, {
    version: "0.1",
    project: "p",
    slices: {
      S1: { title: "First", manifest: ".verity/claims.json", status: "passed" },
      S2: { title: "Second", manifest: ".verity/s2.json" },
    },
  });

  const { exitCode, output } = captureStdout(() => runNext(dir, false));
  assert.equal(exitCode, 0);
  assert.match(output, /S2/);
  assert.match(output, /Second/);
  assert.match(output, /\.verity\/s2\.json/);
  assert.match(output, /passed 1\/2/);

  rmSync(dir, { recursive: true, force: true });
});

test("human report for all-passed returns 0", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, {
    version: "0.1",
    project: "p",
    slices: { S1: { manifest: ".verity/claims.json", status: "passed" } },
  });

  const { exitCode, output } = captureStdout(() => runNext(dir, false));
  assert.equal(exitCode, 0);
  assert.match(output, /all 1 slice\(s\) passed/);

  rmSync(dir, { recursive: true, force: true });
});

test("--json output parses and matches the expected object for an unlocked slice", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, {
    version: "0.1",
    project: "p",
    slices: {
      S1: { manifest: ".verity/claims.json", status: "passed" },
      S2: { title: "Second", manifest: ".verity/s2.json", criteria: ["a", "b"] },
    },
  });

  const { exitCode, output } = captureStdout(() => runNext(dir, true));
  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(output), {
    kind: "unlocked",
    id: "S2",
    manifest: ".verity/s2.json",
    passedCount: 1,
    totalCount: 2,
    title: "Second",
    criteria: ["a", "b"],
    locked: false,
    eligible_mode_b: false,
  });

  rmSync(dir, { recursive: true, force: true });
});

test("--json output for all-passed", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, {
    version: "0.1",
    project: "p",
    slices: { S1: { manifest: ".verity/claims.json", status: "passed" } },
  });

  const { exitCode, output } = captureStdout(() => runNext(dir, true));
  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(output), { kind: "all-passed", totalCount: 1 });

  rmSync(dir, { recursive: true, force: true });
});

test("a harness with no specs/ directory keeps the human report byte-identical to today", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, {
    version: "0.1",
    project: "p",
    slices: { S1: { title: "First", manifest: ".verity/claims.json", criteria: ["a"] } },
  });

  const { exitCode, output } = captureStdout(() => runNext(dir, false));
  assert.equal(exitCode, 0);
  assert.equal(
    output,
    "unlocked: S1 — First\nmanifest: .verity/claims.json\ncriteria:\n  - a\npassed 0/1\n",
  );

  rmSync(dir, { recursive: true, force: true });
});

test("a harness with no specs/ directory reports the eligibility predicate as false", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, singleSliceConfig());

  const { exitCode, output } = captureStdout(() => runNext(dir, true));
  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(output), {
    kind: "unlocked",
    id: "S1",
    manifest: ".verity/claims.json",
    passedCount: 0,
    totalCount: 1,
    locked: false,
    eligible_mode_b: false,
  });

  rmSync(dir, { recursive: true, force: true });
});

test("an accepted, unlocked mode B spec makes the unlocked slice eligible", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, singleSliceConfig());
  writeSpec(dir, "S1", MODE_B_SPEC);

  const { exitCode, output } = captureStdout(() => runNext(dir, true));
  assert.equal(exitCode, 0);
  const report = JSON.parse(output);
  assert.equal(report.eligible_mode_b, true);
  assert.equal(report.locked, false);
  assert.deepEqual(report.spec, {
    mode: "B",
    status: "accepted",
    effort: "high",
    efficiency: [],
    budget: { tokens: 200000 },
    stop_conditions: ["budget-exhaustion", "gate-failure"],
    criteria: ["tests-pass"],
    scope: ["src/spec.ts"],
    type: "feature",
    model: "executor",
    model_source: "effort-default",
    tools: ["Read", "Edit", "Bash", "Grep", "Glob"],
    tools_source: "default",
  });

  rmSync(dir, { recursive: true, force: true });
});

test("a lock on the unlocked slice defeats eligibility but is never parsed", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, singleSliceConfig());
  writeSpec(dir, "S1", MODE_B_SPEC);
  writeLock(dir, "S1");

  const { exitCode, output } = captureStdout(() => runNext(dir, true));
  assert.equal(exitCode, 0);
  const report = JSON.parse(output);
  assert.equal(report.locked, true);
  assert.equal(report.eligible_mode_b, false);

  rmSync(dir, { recursive: true, force: true });
});

test("a proposed mode B spec is reported but is not eligible", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, singleSliceConfig());
  writeSpec(dir, "S1", withStatus("proposed"));

  const { exitCode, output } = captureStdout(() => runNext(dir, true));
  assert.equal(exitCode, 0);
  const report = JSON.parse(output);
  assert.equal(report.spec.status, "proposed");
  assert.equal(report.eligible_mode_b, false);

  rmSync(dir, { recursive: true, force: true });
});

test("a mode A spec is reported with its effort-derived tier and is not eligible", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, singleSliceConfig());
  writeSpec(dir, "S1", [
    "mode: A",
    "efficiency: []",
    "effort: low",
    "budget:",
    '  wall_clock: "2h"',
    "stop_conditions:",
    "  - budget-exhaustion",
    "criteria:",
    "  - tests-pass",
    "status: accepted",
  ]);

  const { exitCode, output } = captureStdout(() => runNext(dir, true));
  assert.equal(exitCode, 0);
  const report = JSON.parse(output);
  assert.equal(report.spec.mode, "A");
  assert.equal(report.spec.model, "worker");
  assert.equal(report.spec.model_source, "effort-default");
  assert.equal(report.spec.scope, undefined);
  assert.equal(report.eligible_mode_b, false);

  rmSync(dir, { recursive: true, force: true });
});

test("an invalid spec for the unlocked slice is a configuration error (exit 2)", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, singleSliceConfig());
  writeSpec(dir, "S1", [...MODE_B_SPEC, "workstream: 2"]);

  const { exitCode } = captureStdout(() => runNext(dir, true));
  assert.equal(exitCode, 2);

  rmSync(dir, { recursive: true, force: true });
});

test("a spec belonging to another slice never affects the unlocked slice", () => {
  const dir = makeTmpDir();
  writeHarnessConfig(dir, {
    version: "0.1",
    project: "p",
    slices: { S1: { manifest: ".verity/s1.json" }, S2: { manifest: ".verity/s2.json" } },
  });
  writeSpec(dir, "S2", MODE_B_SPEC);

  const { exitCode, output } = captureStdout(() => runNext(dir, true));
  assert.equal(exitCode, 0);
  const report = JSON.parse(output);
  assert.equal(report.id, "S1");
  assert.equal(report.spec, undefined);
  assert.equal(report.eligible_mode_b, false);

  rmSync(dir, { recursive: true, force: true });
});
