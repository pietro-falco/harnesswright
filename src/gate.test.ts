import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { runGate } from "./gate.ts";

function makeTmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "harnesswright-gate-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "harnesswright-test"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "harnesswright-test@example.invalid"], { cwd: dir });
  return dir;
}

function writeClaims(dir: string, claims: unknown): void {
  mkdirSync(join(dir, ".verity"), { recursive: true });
  writeFileSync(join(dir, ".verity/claims.json"), JSON.stringify({ version: "0.1", claims }, null, 2));
}

function commitAll(dir: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd: dir });
}

function withCleanGateEnv<T>(fn: () => T): T {
  const previous = process.env.HARNESSWRIGHT_GATE;
  delete process.env.HARNESSWRIGHT_GATE;
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.HARNESSWRIGHT_GATE;
    } else {
      process.env.HARNESSWRIGHT_GATE = previous;
    }
  }
}

test("gate with no slice id returns 0 when the manifest passes", () => {
  const dir = makeTmpRepo();
  writeFileSync(join(dir, "README.md"), "hello\n");
  writeClaims(dir, [{ id: "readme-exists", type: "file_exists", path: "README.md" }]);
  commitAll(dir, "seed");

  assert.equal(
    withCleanGateEnv(() => runGate(undefined, dir)),
    0,
  );

  rmSync(dir, { recursive: true, force: true });
});

test("gate with no slice id returns 1 when a claim fails", () => {
  const dir = makeTmpRepo();
  writeClaims(dir, [{ id: "missing-file", type: "file_exists", path: "does-not-exist.txt" }]);
  commitAll(dir, "seed");

  assert.equal(
    withCleanGateEnv(() => runGate(undefined, dir)),
    1,
  );

  rmSync(dir, { recursive: true, force: true });
});

test("gate returns 2 when there is no manifest and no harness.json", () => {
  const dir = makeTmpRepo();

  assert.equal(
    withCleanGateEnv(() => runGate(undefined, dir)),
    2,
  );

  rmSync(dir, { recursive: true, force: true });
});

test("gate returns 2 when harness.json has an unknown field", () => {
  const dir = makeTmpRepo();
  mkdirSync(join(dir, ".harness"), { recursive: true });
  writeFileSync(
    join(dir, ".harness/harness.json"),
    JSON.stringify({
      version: "0.1",
      project: "p",
      extra: true,
      slices: { S1: { manifest: ".verity/claims.json" } },
    }),
  );

  assert.equal(
    withCleanGateEnv(() => runGate("S1", dir)),
    2,
  );

  rmSync(dir, { recursive: true, force: true });
});

test("gate returns 2 for an unknown slice id", () => {
  const dir = makeTmpRepo();
  mkdirSync(join(dir, ".harness"), { recursive: true });
  writeFileSync(
    join(dir, ".harness/harness.json"),
    JSON.stringify({ version: "0.1", project: "p", slices: { S1: { manifest: ".verity/claims.json" } } }),
  );

  assert.equal(
    withCleanGateEnv(() => runGate("NOPE", dir)),
    2,
  );

  rmSync(dir, { recursive: true, force: true });
});

test("gate returns 2 when the slice manifest does not exist", () => {
  const dir = makeTmpRepo();
  mkdirSync(join(dir, ".harness"), { recursive: true });
  writeFileSync(
    join(dir, ".harness/harness.json"),
    JSON.stringify({
      version: "0.1",
      project: "p",
      slices: { S1: { manifest: ".verity/does-not-exist.json" } },
    }),
  );

  assert.equal(
    withCleanGateEnv(() => runGate("S1", dir)),
    2,
  );

  rmSync(dir, { recursive: true, force: true });
});

test("gate returns 2 immediately when HARNESSWRIGHT_GATE=1 is already set, without spawning anything", () => {
  const dir = makeTmpRepo();
  writeFileSync(join(dir, "README.md"), "hello\n");
  writeClaims(dir, [{ id: "readme-exists", type: "file_exists", path: "README.md" }]);
  commitAll(dir, "seed");

  const previous = process.env.HARNESSWRIGHT_GATE;
  process.env.HARNESSWRIGHT_GATE = "1";
  try {
    assert.equal(runGate(undefined, dir), 2);
  } finally {
    if (previous === undefined) {
      delete process.env.HARNESSWRIGHT_GATE;
    } else {
      process.env.HARNESSWRIGHT_GATE = previous;
    }
  }

  rmSync(dir, { recursive: true, force: true });
});
