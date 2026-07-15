import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveModel, effectiveTools, isModeBEligible, parseSpec, type Spec } from "./spec.ts";

function frontmatter(lines: string[]): string {
  return ["---", ...lines, "---", "", "# Brief", "", "Prose body, never parsed.", ""].join("\n");
}

const VALID_A = [
  "mode: A",
  "efficiency:",
  "  - filesystem-discovery-first",
  "effort: low",
  "budget:",
  "  tokens: 200000",
  "stop_conditions:",
  "  - budget-exhaustion",
  "criteria:",
  "  - tests-pass",
  "status: accepted",
];

const VALID_B = [
  "mode: B",
  "efficiency: []",
  "effort: high",
  "budget:",
  '  wall_clock: "2h"',
  "stop_conditions:",
  "  - budget-exhaustion",
  "criteria:",
  "  - tests-pass",
  "status: accepted",
  "type: feature",
  "scope:",
  "  - src/spec.ts",
];

function withoutLine(lines: string[], prefix: string): string[] {
  const start = lines.findIndex((line) => line.startsWith(prefix));
  const end = lines.findIndex((line, i) => i > start && !line.startsWith("  "));
  return [...lines.slice(0, start), ...lines.slice(end === -1 ? lines.length : end)];
}

function assertInvalid(lines: string[], match: RegExp): void {
  assert.throws(() => parseSpec(frontmatter(lines)), match);
}

test("a minimal mode A spec parses with every declared field", () => {
  const spec = parseSpec(frontmatter(VALID_A));
  assert.deepEqual(spec, {
    mode: "A",
    efficiency: ["filesystem-discovery-first"],
    effort: "low",
    budget: { tokens: 200000 },
    stop_conditions: ["budget-exhaustion", "gate-failure"],
    criteria: ["tests-pass"],
    status: "accepted",
  } satisfies Spec);
});

test("gate-failure is added to stop_conditions when it is not declared", () => {
  const spec = parseSpec(frontmatter(VALID_A));
  assert.ok(spec.stop_conditions.includes("gate-failure"));
});

test("gate-failure declared explicitly is not duplicated", () => {
  const spec = parseSpec(
    frontmatter([...withoutLine(VALID_A, "stop_conditions:"), "stop_conditions:", "  - gate-failure"]),
  );
  assert.deepEqual(spec.stop_conditions, ["gate-failure"]);
});

test("an empty efficiency list is valid", () => {
  const spec = parseSpec(frontmatter(VALID_B));
  assert.deepEqual(spec.efficiency, []);
});

test("a mode B spec parses scope and an optional model", () => {
  const spec = parseSpec(frontmatter([...VALID_B, "model: claude-sonnet-5"]));
  assert.equal(spec.mode, "B");
  assert.deepEqual(spec.scope, ["src/spec.ts"]);
  assert.equal(spec.model, "claude-sonnet-5");
});

test("budget accepts all three dimensions together", () => {
  const spec = parseSpec(
    frontmatter([
      ...withoutLine(VALID_A, "budget:"),
      "budget:",
      "  tokens: 200000",
      "  turns: 40",
      '  wall_clock: "90m"',
    ]),
  );
  assert.deepEqual(spec.budget, { tokens: 200000, turns: 40, wall_clock: "90m" });
});

test("scope may declare a whole-repo lease with the literal dot", () => {
  const spec = parseSpec(frontmatter([...withoutLine(VALID_B, "scope:"), "scope:", "  - ."]));
  assert.deepEqual(spec.scope, ["."]);
});

test("scope is optional for mode A", () => {
  const spec = parseSpec(frontmatter(VALID_A));
  assert.equal(spec.scope, undefined);
});

test("a spec without a frontmatter block is a configuration error", () => {
  assert.throws(() => parseSpec("# Brief\n\nNo frontmatter here.\n"), /frontmatter/);
});

test("an unterminated frontmatter block is a configuration error", () => {
  assert.throws(() => parseSpec("---\nmode: A\n"), /frontmatter/);
});

test("an unknown key is a configuration error", () => {
  assertInvalid([...VALID_A, "workstream: 2"], /unknown field in spec: "workstream"/);
});

test("a duplicate key is a configuration error", () => {
  assertInvalid([...VALID_A, "mode: B"], /duplicate field in spec: "mode"/);
});

test("indentation deeper than one level is a configuration error", () => {
  assertInvalid(
    [...withoutLine(VALID_A, "budget:"), "budget:", "  tokens:", "    value: 10"],
    /indentation|scalar/,
  );
});

for (const key of ["mode", "efficiency", "effort", "budget", "stop_conditions", "criteria", "status"]) {
  test(`a missing required key "${key}" is a configuration error`, () => {
    assertInvalid(withoutLine(VALID_A, `${key}:`), new RegExp(`spec must declare "${key}"`));
  });
}

test("an unknown mode is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_A, "mode:"), "mode: C"], /spec "mode" must be "A" or "B"/);
});

test("an unknown effort is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_A, "effort:"), "effort: medium"], /spec "effort" must be "low" or "high"/);
});

test("an unknown status is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_A, "status:"), "status: Accepted"], /spec "status" must be/);
});

test("a budget with no dimension is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_A, "budget:"), "budget: []"], /budget/);
});

test("an unknown budget dimension is a configuration error", () => {
  assertInvalid(
    [...withoutLine(VALID_A, "budget:"), "budget:", "  dollars: 5"],
    /unknown budget dimension: "dollars"/,
  );
});

test("a non-positive budget.tokens is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_A, "budget:"), "budget:", "  tokens: 0"], /positive integer/);
});

test("a negative budget.turns is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_A, "budget:"), "budget:", "  turns: -1"], /positive integer/);
});

test("a fractional budget.tokens is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_A, "budget:"), "budget:", "  tokens: 1.5"], /positive integer/);
});

for (const bad of ["2d", "2", "h", "2 h"]) {
  test(`a budget.wall_clock of "${bad}" is a configuration error`, () => {
    assertInvalid([...withoutLine(VALID_A, "budget:"), "budget:", `  wall_clock: "${bad}"`], /wall_clock/);
  });
}

test("an empty criteria list is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_A, "criteria:"), "criteria: []"], /criteria.*non-empty/);
});

test("a scalar where a list is required is a configuration error", () => {
  assertInvalid(
    [...withoutLine(VALID_A, "stop_conditions:"), "stop_conditions: gate-failure"],
    /stop_conditions.*list/,
  );
});

test("mode B without scope is a configuration error", () => {
  assertInvalid(withoutLine(VALID_B, "scope:"), /spec must declare "scope" when mode is B/);
});

test("mode B with an empty scope list is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_B, "scope:"), "scope: []"], /scope.*non-empty/);
});

for (const bad of ["/src", "../src", "src/../lib", "./src", "src/", "src//lib"]) {
  test(`a malformed scope entry "${bad}" is a configuration error`, () => {
    assertInvalid([...withoutLine(VALID_B, "scope:"), "scope:", `  - "${bad}"`], /scope/);
  });
}

test("an empty scope entry is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_B, "scope:"), "scope:", '  - ""'], /scope/);
});

test("an empty model string is a configuration error", () => {
  assertInvalid([...VALID_A, 'model: ""'], /model.*non-empty/);
});

test("a mode B spec parses a declared type", () => {
  assert.equal(parseSpec(frontmatter(VALID_B)).type, "feature");
});

test("type is optional for mode A", () => {
  assert.equal(parseSpec(frontmatter(VALID_A)).type, undefined);
});

for (const value of ["chore", "bug", "feature", "hotfix"]) {
  test(`type "${value}" is valid on a mode A spec`, () => {
    assert.equal(parseSpec(frontmatter([...VALID_A, `type: ${value}`])).type, value);
  });
}

test("mode B without type is a configuration error", () => {
  assertInvalid(withoutLine(VALID_B, "type:"), /spec must declare "type" when mode is B/);
});

test("an unknown type is a configuration error", () => {
  assertInvalid([...withoutLine(VALID_B, "type:"), "type: refactor"], /spec "type" must be one of/);
});

test("type hotfix with mode B is a configuration error (hotfix is Mode A only)", () => {
  assertInvalid([...withoutLine(VALID_B, "type:"), "type: hotfix"], /hotfix.*Mode A/);
});

test("tools defaults to the conservative set when absent (ADR-005 D3)", () => {
  assert.deepEqual(effectiveTools(parseSpec(frontmatter(VALID_A))), {
    tools: ["Read", "Edit", "Bash", "Grep", "Glob"],
    tools_source: "default",
  });
});

test("a declared tools list wins over the default (ADR-005 D3)", () => {
  const spec = parseSpec(frontmatter([...VALID_A, "tools:", "  - Read", "  - Bash"]));
  assert.deepEqual(spec.tools, ["Read", "Bash"]);
  assert.deepEqual(effectiveTools(spec), { tools: ["Read", "Bash"], tools_source: "declared" });
});

test("an empty tools list is a valid declaration (ADR-005 D3 does not forbid it)", () => {
  const spec = parseSpec(frontmatter([...VALID_A, "tools: []"]));
  assert.deepEqual(spec.tools, []);
  assert.deepEqual(effectiveTools(spec), { tools: [], tools_source: "declared" });
});

test("a tools entry that is an empty string is a configuration error", () => {
  assertInvalid([...VALID_A, "tools:", '  - ""'], /tools.*non-empty/);
});

test("effort low routes to the worker tier when model is absent (D8)", () => {
  assert.deepEqual(effectiveModel(parseSpec(frontmatter(VALID_A))), {
    model: "worker",
    model_source: "effort-default",
  });
});

test("effort high routes to the executor tier when model is absent (D8)", () => {
  assert.deepEqual(effectiveModel(parseSpec(frontmatter(VALID_B))), {
    model: "executor",
    model_source: "effort-default",
  });
});

test("a declared model wins over the effort default (D8)", () => {
  assert.deepEqual(effectiveModel(parseSpec(frontmatter([...VALID_B, "model: gpt-5-codex"]))), {
    model: "gpt-5-codex",
    model_source: "declared",
  });
});

test("eligibility is false when no spec exists", () => {
  assert.equal(isModeBEligible(null, false), false);
});

test("eligibility is false for a mode A spec", () => {
  assert.equal(isModeBEligible(parseSpec(frontmatter(VALID_A)), false), false);
});

test("eligibility is false for a mode B spec that is only proposed", () => {
  const spec = parseSpec(frontmatter([...withoutLine(VALID_B, "status:"), "status: proposed"]));
  assert.equal(isModeBEligible(spec, false), false);
});

test("eligibility is false for an accepted mode B spec when a lock is present", () => {
  assert.equal(isModeBEligible(parseSpec(frontmatter(VALID_B)), true), false);
});

test("eligibility is true for an accepted, unlocked mode B spec", () => {
  assert.equal(isModeBEligible(parseSpec(frontmatter(VALID_B)), false), true);
});
