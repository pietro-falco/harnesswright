import assert from "node:assert/strict";
import { test } from "node:test";
import type { HarnessConfig } from "./harness.ts";
import { schedule } from "./schedule.ts";

function config(slices: HarnessConfig["slices"]): HarnessConfig {
  return { version: "0.1", project: "p", workstreamCap: 1, slices };
}

test("all slices passed returns all-passed with the total count", () => {
  const result = schedule(
    config({
      S1: { manifest: ".verity/s1.json", status: "passed" },
      S2: { manifest: ".verity/s2.json", status: "passed" },
    }),
  );
  assert.deepEqual(result, { kind: "all-passed", totalCount: 2 });
});

test("no status fields at all (v0 config) unlocks the first slice in order", () => {
  const result = schedule(
    config({
      S1: { manifest: ".verity/s1.json" },
      S2: { manifest: ".verity/s2.json" },
    }),
  );
  assert.deepEqual(result, {
    kind: "unlocked",
    id: "S1",
    manifest: ".verity/s1.json",
    passedCount: 0,
    totalCount: 2,
  });
});

test("a middle slice unlocks when earlier slices are passed and later ones are not", () => {
  const result = schedule(
    config({
      S1: { manifest: ".verity/s1.json", status: "passed" },
      S2: { manifest: ".verity/s2.json" },
      S3: { manifest: ".verity/s3.json" },
    }),
  );
  assert.deepEqual(result, {
    kind: "unlocked",
    id: "S2",
    manifest: ".verity/s2.json",
    passedCount: 1,
    totalCount: 3,
  });
});

test("S2 sorts before S10 (natural numeric order, not lexicographic)", () => {
  const result = schedule(
    config({
      S10: { manifest: ".verity/s10.json" },
      S2: { manifest: ".verity/s2.json" },
    }),
  );
  assert.equal(result.kind, "unlocked");
  assert.equal((result as { id: string }).id, "S2");
});

test("title and criteria are passed through verbatim on the unlocked slice", () => {
  const result = schedule(
    config({
      S1: {
        manifest: ".verity/s1.json",
        title: "First slice",
        criteria: ["criterion a", "criterion b"],
      },
    }),
  );
  assert.deepEqual(result, {
    kind: "unlocked",
    id: "S1",
    title: "First slice",
    manifest: ".verity/s1.json",
    criteria: ["criterion a", "criterion b"],
    passedCount: 0,
    totalCount: 1,
  });
});
