import assert from "node:assert/strict";
import { test } from "node:test";
import { detectSelfReferentialClaims, findDuplicateBranches, parseWorktrees } from "./doctor.ts";

test("parseWorktrees: two worktrees on different branches yields no duplicate", () => {
  const porcelain = `worktree /repo/main
HEAD abcdef1234567890abcdef1234567890abcdef12
branch refs/heads/main

worktree /repo/../repo-feature
HEAD 1234567890abcdef1234567890abcdef12345678
branch refs/heads/feature
`;
  const worktrees = parseWorktrees(porcelain);
  assert.deepEqual(worktrees, [
    { path: "/repo/main", branch: "main" },
    { path: "/repo/../repo-feature", branch: "feature" },
  ]);
  assert.deepEqual(findDuplicateBranches(worktrees), []);
});

test("parseWorktrees: the same branch checked out twice is detected as a duplicate", () => {
  const porcelain = `worktree /repo/main
HEAD abcdef1234567890abcdef1234567890abcdef12
branch refs/heads/main

worktree /repo/../repo-main-copy
HEAD abcdef1234567890abcdef1234567890abcdef12
branch refs/heads/main
`;
  const worktrees = parseWorktrees(porcelain);
  assert.deepEqual(findDuplicateBranches(worktrees), ["main"]);
});

test("parseWorktrees: a detached HEAD worktree yields branch null without crashing", () => {
  const porcelain = `worktree /repo/detached
HEAD abcdef1234567890abcdef1234567890abcdef12
detached
`;
  const worktrees = parseWorktrees(porcelain);
  assert.deepEqual(worktrees, [{ path: "/repo/detached", branch: null }]);
  assert.deepEqual(findDuplicateBranches(worktrees), []);
});

test("detectSelfReferentialClaims: a claim running node dist/cli.js gate is detected", () => {
  const manifest = JSON.stringify({
    version: "0.1",
    claims: [{ id: "suspect", type: "command", run: "node dist/cli.js gate" }],
  });
  assert.deepEqual(detectSelfReferentialClaims(manifest), ["suspect"]);
});

test("detectSelfReferentialClaims: a claim with verity verify in its run is detected", () => {
  const manifest = JSON.stringify({
    version: "0.1",
    claims: [{ id: "suspect", type: "command", run: "npx -y @pietro-falco/verity verify" }],
  });
  assert.deepEqual(detectSelfReferentialClaims(manifest), ["suspect"]);
});

test("detectSelfReferentialClaims: a clean manifest yields an empty array", () => {
  const manifest = JSON.stringify({
    version: "0.1",
    claims: [{ id: "clean", type: "file_exists", path: "README.md" }],
  });
  assert.deepEqual(detectSelfReferentialClaims(manifest), []);
});

test("detectSelfReferentialClaims: invalid JSON yields an empty array", () => {
  assert.deepEqual(detectSelfReferentialClaims("{ not json"), []);
});
