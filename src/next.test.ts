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
