import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { emit } from "./emit.ts";
import { plan } from "./plan.ts";
import { renderTemplates } from "./templates.ts";

function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out.sort();
}

test("init --yes on an empty directory creates exactly the 10 spec paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "harnesswright-"));
  const specs = renderTemplates(basename(dir));

  emit(plan(specs, new Set(), false), specs, dir);

  for (const spec of specs) {
    assert.ok(existsSync(join(dir, spec.path)), `expected ${spec.path} to exist`);
  }
  assert.equal(listFilesRecursive(dir).length, specs.length);

  rmSync(dir, { recursive: true, force: true });
});

test("--dry-run (plan only, no emit) writes nothing to disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "harnesswright-"));
  const before = listFilesRecursive(dir);

  const specs = renderTemplates(basename(dir));
  plan(specs, new Set(), false);

  const after = listFilesRecursive(dir);
  assert.deepEqual(after, before);
  assert.equal(after.length, 0);

  rmSync(dir, { recursive: true, force: true });
});

test("a second init without --force skips existing files and leaves content unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "harnesswright-"));
  const specs = renderTemplates(basename(dir));

  emit(plan(specs, new Set(), false), specs, dir);
  const firstPass = new Map(specs.map((s) => [s.path, readFileSync(join(dir, s.path))]));

  const existing = new Set(specs.filter((s) => existsSync(join(dir, s.path))).map((s) => s.path));
  const entries = plan(specs, existing, false);
  assert.ok(entries.every((e) => e.action === "skip"));

  const summary = emit(entries, specs, dir);
  assert.deepEqual(summary, { created: 0, skipped: 10, overwritten: 0 });

  for (const spec of specs) {
    assert.deepEqual(readFileSync(join(dir, spec.path)), firstPass.get(spec.path));
  }

  rmSync(dir, { recursive: true, force: true });
});

test("a second init with --force overwrites every existing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "harnesswright-"));
  const specs = renderTemplates(basename(dir));

  emit(plan(specs, new Set(), false), specs, dir);

  const existing = new Set(specs.map((s) => s.path));
  const entries = plan(specs, existing, true);
  assert.ok(entries.every((e) => e.action === "overwrite"));

  const summary = emit(entries, specs, dir);
  assert.deepEqual(summary, { created: 0, skipped: 0, overwritten: 10 });

  rmSync(dir, { recursive: true, force: true });
});

test("emitted .harness/harness.json is valid JSON with version 0.1 and project = dir name", () => {
  const dir = mkdtempSync(join(tmpdir(), "harnesswright-"));
  const project = basename(dir);
  const specs = renderTemplates(project);

  emit(plan(specs, new Set(), false), specs, dir);

  const parsed = JSON.parse(readFileSync(join(dir, ".harness/harness.json"), "utf8"));
  assert.equal(parsed.version, "0.1");
  assert.equal(parsed.project, project);

  rmSync(dir, { recursive: true, force: true });
});
