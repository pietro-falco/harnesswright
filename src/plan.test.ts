import assert from "node:assert/strict";
import { test } from "node:test";
import { plan } from "./plan.ts";
import { renderTemplates } from "./templates.ts";

const SPECS = renderTemplates("test-project");
const ALL_PATHS = new Set(SPECS.map((s) => s.path));

test("empty directory produces 10 create entries", () => {
  const entries = plan(SPECS, new Set(), false);
  assert.equal(entries.length, 10);
  assert.ok(entries.every((e) => e.action === "create"));
});

test("all existing without force produces 10 skip entries", () => {
  const entries = plan(SPECS, ALL_PATHS, false);
  assert.equal(entries.length, 10);
  assert.ok(entries.every((e) => e.action === "skip"));
});

test("all existing with force produces 10 overwrite entries", () => {
  const entries = plan(SPECS, ALL_PATHS, true);
  assert.equal(entries.length, 10);
  assert.ok(entries.every((e) => e.action === "overwrite"));
});

test("mix of existing and missing paths produces the right action per path", () => {
  const existing = new Set([".harness/harness.json", "AGENTS.md"]);
  const entries = plan(SPECS, existing, false);
  const byPath = new Map(entries.map((e) => [e.path, e.action]));

  assert.equal(byPath.get(".harness/harness.json"), "skip");
  assert.equal(byPath.get("AGENTS.md"), "skip");
  assert.equal(byPath.get("SKILL.md"), "create");
  assert.equal(entries.filter((e) => e.action === "skip").length, 2);
  assert.equal(entries.filter((e) => e.action === "create").length, 8);
});

test("output is sorted lexicographically by path", () => {
  const entries = plan(SPECS, new Set(), false);
  const paths = entries.map((e) => e.path);
  const sorted = [...paths].sort();
  assert.deepEqual(paths, sorted);
});

test("sort order is the same regardless of input order", () => {
  const shuffled = [...SPECS].reverse();
  const a = plan(SPECS, new Set(), false).map((e) => e.path);
  const b = plan(shuffled, new Set(), false).map((e) => e.path);
  assert.deepEqual(a, b);
});
