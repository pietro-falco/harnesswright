import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseHarnessConfig } from "./harness.ts";

export type CheckResult = { name: string; level: "ok" | "warn" | "fail"; detail: string };

export function parseWorktrees(porcelain: string): { path: string; branch: string | null }[] {
  const results: { path: string; branch: string | null }[] = [];
  let currentPath: string | null = null;
  let currentBranch: string | null = null;

  const flush = () => {
    if (currentPath !== null) {
      results.push({ path: currentPath, branch: currentBranch });
    }
    currentPath = null;
    currentBranch = null;
  };

  for (const line of porcelain.split("\n")) {
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) {
      flush();
      currentPath = line.slice("worktree ".length);
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      currentBranch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    }
  }
  flush();

  return results;
}

export function findDuplicateBranches(worktrees: { path: string; branch: string | null }[]): string[] {
  const counts = new Map<string, number>();
  for (const wt of worktrees) {
    if (wt.branch === null) continue;
    counts.set(wt.branch, (counts.get(wt.branch) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([branch]) => branch);
}

const SELF_REFERENCE_PATTERNS = ["harnesswright gate", "cli.js gate", "verity verify"];

export function detectSelfReferentialClaims(manifestRaw: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(manifestRaw);
  } catch {
    return [];
  }

  if (typeof data !== "object" || data === null) {
    return [];
  }

  const claims = (data as Record<string, unknown>).claims;
  if (!Array.isArray(claims)) {
    return [];
  }

  const ids: string[] = [];
  for (const claim of claims) {
    if (typeof claim !== "object" || claim === null) continue;
    const c = claim as Record<string, unknown>;
    if (c.type !== "command" || typeof c.run !== "string" || typeof c.id !== "string") continue;
    if (SELF_REFERENCE_PATTERNS.some((pattern) => (c.run as string).includes(pattern))) {
      ids.push(c.id);
    }
  }

  return ids;
}

function checkGitPresent(): CheckResult {
  const result = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (result.status === 0) {
    return { name: "git-present", level: "ok", detail: result.stdout.trim() };
  }
  return { name: "git-present", level: "fail", detail: "git is not available" };
}

function checkHooksPath(cwd: string): CheckResult {
  const result = spawnSync("git", ["config", "core.hooksPath"], { cwd, encoding: "utf8" });
  const hooksPath = result.status === 0 ? result.stdout.trim() : "";

  if (hooksPath === "") {
    return { name: "hooks-path", level: "warn", detail: "no hooksPath configured" };
  }

  if (!existsSync(join(cwd, hooksPath))) {
    return {
      name: "hooks-path",
      level: "fail",
      detail: `core.hooksPath is set to "${hooksPath}" but that directory does not exist`,
    };
  }

  return { name: "hooks-path", level: "ok", detail: `core.hooksPath = ${hooksPath}` };
}

function checkVerityResolvable(cwd: string): CheckResult {
  const result = spawnSync("npx", ["-y", "@pietro-falco/verity", "--version"], { cwd, encoding: "utf8" });
  if (result.status === 0) {
    return { name: "verity-resolvable", level: "ok", detail: `verity ${result.stdout.trim()}` };
  }
  return { name: "verity-resolvable", level: "fail", detail: "verity is not resolvable via npx" };
}

function checkWorktreeHygiene(cwd: string): CheckResult {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    return { name: "worktree-hygiene", level: "fail", detail: "git worktree list failed" };
  }

  const worktrees = parseWorktrees(result.stdout);
  const duplicates = findDuplicateBranches(worktrees);

  if (duplicates.length === 0) {
    return {
      name: "worktree-hygiene",
      level: "ok",
      detail: `${worktrees.length} worktree(s), no duplicate branch checkouts`,
    };
  }

  return {
    name: "worktree-hygiene",
    level: "fail",
    detail: `branch(es) checked out in more than one worktree: ${duplicates.join(", ")}`,
  };
}

function checkManifestSelfReference(cwd: string): CheckResult {
  const manifestPath = join(cwd, ".verity/claims.json");
  if (!existsSync(manifestPath)) {
    return { name: "manifest-self-reference", level: "warn", detail: "no manifest (run harnesswright init)" };
  }

  const ids = detectSelfReferentialClaims(readFileSync(manifestPath, "utf8"));
  if (ids.length === 0) {
    return { name: "manifest-self-reference", level: "ok", detail: "no self-referential claims found" };
  }

  return {
    name: "manifest-self-reference",
    level: "warn",
    detail: `possible self-referential claim(s): ${ids.join(", ")}`,
  };
}

function checkHarnessConfig(cwd: string): CheckResult {
  const harnessPath = join(cwd, ".harness/harness.json");
  if (!existsSync(harnessPath)) {
    return { name: "harness-config", level: "warn", detail: "no harness config (run harnesswright init)" };
  }

  try {
    parseHarnessConfig(readFileSync(harnessPath, "utf8"));
    return { name: "harness-config", level: "ok", detail: ".harness/harness.json is valid" };
  } catch (err) {
    return { name: "harness-config", level: "fail", detail: (err as Error).message };
  }
}

export function runDoctor(cwd: string): number {
  const checks: CheckResult[] = [
    checkGitPresent(),
    checkHooksPath(cwd),
    checkVerityResolvable(cwd),
    checkWorktreeHygiene(cwd),
    checkManifestSelfReference(cwd),
    checkHarnessConfig(cwd),
  ];

  for (const check of checks) {
    process.stdout.write(`[${check.level}] ${check.name} — ${check.detail}\n`);
  }

  return checks.some((check) => check.level === "fail") ? 1 : 0;
}
