import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHarnessConfig } from "./harness.ts";

test("valid minimal config: version + project only", () => {
  const config = parseHarnessConfig(JSON.stringify({ version: "0.1", project: "my-app" }));
  assert.deepEqual(config, { version: "0.1", project: "my-app", workstreamCap: 1, slices: {} });
});

test("valid config with slices and title", () => {
  const config = parseHarnessConfig(
    JSON.stringify({
      version: "0.1",
      project: "my-app",
      slices: { S1: { title: "First slice", manifest: ".verity/claims.json" } },
    }),
  );
  assert.deepEqual(config.slices, { S1: { title: "First slice", manifest: ".verity/claims.json" } });
});

test("broken JSON throws", () => {
  assert.throws(() => parseHarnessConfig("{ not json"));
});

test("wrong version throws", () => {
  assert.throws(() => parseHarnessConfig(JSON.stringify({ version: "0.2", project: "my-app" })), /version/);
});

test("unknown top-level field throws", () => {
  assert.throws(
    () => parseHarnessConfig(JSON.stringify({ version: "0.1", project: "my-app", extra: true })),
    /unknown field/,
  );
});

test("unknown field inside a slice throws", () => {
  assert.throws(
    () =>
      parseHarnessConfig(
        JSON.stringify({
          version: "0.1",
          project: "my-app",
          slices: { S1: { manifest: ".verity/claims.json", extra: true } },
        }),
      ),
    /unknown field in slice/,
  );
});

test("absolute manifest path throws", () => {
  assert.throws(
    () =>
      parseHarnessConfig(
        JSON.stringify({
          version: "0.1",
          project: "my-app",
          slices: { S1: { manifest: "/etc/passwd" } },
        }),
      ),
    /absolute/,
  );
});

test("illegal slice key throws", () => {
  assert.throws(
    () =>
      parseHarnessConfig(
        JSON.stringify({
          version: "0.1",
          project: "my-app",
          slices: { "S 1": { manifest: ".verity/claims.json" } },
        }),
      ),
    /invalid slice id/,
  );
});

test("workstreamCap defaults to 1 when absent", () => {
  const config = parseHarnessConfig(JSON.stringify({ version: "0.1", project: "my-app" }));
  assert.equal(config.workstreamCap, 1);
});

test("valid config with status, passedOn, and criteria", () => {
  const config = parseHarnessConfig(
    JSON.stringify({
      version: "0.1",
      project: "my-app",
      slices: {
        S1: {
          title: "First slice",
          manifest: ".verity/claims.json",
          status: "passed",
          passedOn: "2026-07-02",
          criteria: ["a", "b"],
        },
      },
    }),
  );
  assert.deepEqual(config.slices, {
    S1: {
      title: "First slice",
      manifest: ".verity/claims.json",
      status: "passed",
      passedOn: "2026-07-02",
      criteria: ["a", "b"],
    },
  });
});

test("status other than 'passed' throws", () => {
  assert.throws(
    () =>
      parseHarnessConfig(
        JSON.stringify({
          version: "0.1",
          project: "my-app",
          slices: { S1: { manifest: ".verity/claims.json", status: "done" } },
        }),
      ),
    /status/,
  );
});

test("passedOn in the wrong format throws", () => {
  assert.throws(
    () =>
      parseHarnessConfig(
        JSON.stringify({
          version: "0.1",
          project: "my-app",
          slices: { S1: { manifest: ".verity/claims.json", passedOn: "07/02/2026" } },
        }),
      ),
    /passedOn/,
  );
});

test("criteria as a non-array throws", () => {
  assert.throws(
    () =>
      parseHarnessConfig(
        JSON.stringify({
          version: "0.1",
          project: "my-app",
          slices: { S1: { manifest: ".verity/claims.json", criteria: "not an array" } },
        }),
      ),
    /criteria/,
  );
});

test("criteria with a non-string element throws", () => {
  assert.throws(
    () =>
      parseHarnessConfig(
        JSON.stringify({
          version: "0.1",
          project: "my-app",
          slices: { S1: { manifest: ".verity/claims.json", criteria: ["ok", 5] } },
        }),
      ),
    /criteria/,
  );
});
