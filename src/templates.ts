export type FileSpec = { path: string; content: string };

function harnessJson(project: string): string {
  return `${JSON.stringify(
    {
      version: "0.1",
      project,
      workstreamCap: 1,
      slices: {
        S1: {
          title: "First slice",
          manifest: ".verity/claims.json",
        },
      },
    },
    null,
    2,
  )}\n`;
}

const LEDGER_MD = `# Slice ledger

Evidence is raw stdout only — command output, file content, exit codes.
Prose descriptions of what was done are never evidence.

| ID | Slice | Acceptance criteria | Required evidence | Gate | Status |
|----|-------|----------------------|--------------------|------|--------|
| S1 | Example slice | State what "done" means, concretely | The raw command output that proves it | Deterministic | Not started |
`;

const STARTER_CLAIMS_JSON = `${JSON.stringify(
  {
    version: "0.1",
    claims: [
      {
        id: "harness-config-exists",
        type: "file_exists",
        description: "harness config file exists at repo root",
        path: ".harness/harness.json",
      },
    ],
  },
  null,
  2,
)}\n`;

const ADR_TEMPLATE_MD = `# ADR-NNN: <title>

- **Status:** <Proposed | Accepted | Superseded>
- **Date:** <YYYY-MM-DD>
- **Deciders:** <names>

## Context

<What problem this decision addresses, and what forces are in tension.>

## Decision

<What was decided.>

## Non-goals

<What is explicitly out of scope for this decision.>

## Alternatives considered

<What else was considered, and why it was rejected.>

## Consequences

<What becomes easier or harder as a result of this decision.>
`;

const ADR_0001_MD = `# ADR-0001: Adopt an evidence-gated harness

- **Status:** Proposed
- **Date:** <YYYY-MM-DD>
- **Deciders:** <names>

## Context

Coding agents report their own work as done. A fluent summary is not
evidence: it can diverge from what is actually committed, written to disk,
or exercised by a command. Without a deterministic check, "done" means
whatever the agent says it means.

## Decision

Adopt an evidence-gated harness for this repository:

- Work is broken into slices, each with acceptance criteria and a
  deterministic gate (a verity claims manifest) checked before the slice
  is considered done.
- Each work session uses one git worktree per branch, never a shared
  working tree across concurrent sessions.
- Architecture decisions follow a two-commit lifecycle: a decision is
  first committed in Proposed status (docs-only), reviewed, then flipped
  to Accepted in a second, separate commit.

## Non-goals

- No agent execution. The harness never spawns or supervises an agent; it
  only gates the results of work already done.
- No LLM-as-judge. Every gate verdict comes from a deterministic check —
  file state, git state, or a command's exit code — never from a model's
  opinion.
- No autonomous triggers. Every gate run is operator-initiated.

## Alternatives considered

- Trusting agent self-reports: rejected — no way to catch narrative drift
  between what an agent says it did and what is actually on disk.
- Human review of every artifact as the sole gate: rejected as the only
  mechanism — too slow to run on every slice, though it remains available
  where the ledger calls for a human gate.

## Consequences

Slices take slightly longer to close because each one needs a checkable
claim, but "done" becomes a verifiable fact instead of a claim.
`;

const AGENTS_MD = `# AGENTS.md

Operating contract for any agent working in this repository.

## Roles

- **Planner** — breaks work into slices, each with a stated acceptance
  criterion and a required evidence type, recorded in the ledger before
  implementation starts.
- **Implementer** — writes the code or docs for one slice, then produces
  the raw evidence the slice's gate requires.
- **Verifier** — runs the gate (\`harnesswright gate\` or \`verity verify\`)
  and reports the raw result, unedited. A verdict is the exit code and
  receipt as given — never a paraphrase.

One agent may hold more than one role in a session, but every slice passes
through all three before it is marked done.

## Evidence rule

Evidence is raw stdout only: \`git show HEAD:<path>\`, \`cat -n <path>\`, a
command's exit code, or a verity receipt. Prose describing what was done is
never evidence, however detailed. If a claim cannot be checked by a
deterministic command, it is not ready to be a claim.

## Hard-stop convention

Execute only the step that was requested. When a command fails, or
produces a result other than the one expected, stop at that point and
report the raw error — do not guess a fix and continue past it.

## Worktree convention

One git worktree per session per branch. Never share a working tree across
two concurrent sessions, and never touch a branch another session is
actively working on.

## Commit convention

Commits are atomic and follow Conventional Commits. Stage files with
explicit paths (\`git add path/to/file\`), never a bare \`git add -A\` or
\`git add .\`. Pre-commit hooks are never bypassed (no \`--no-verify\`); if a
hook blocks a commit, fix the underlying issue and re-stage.
`;

const SKILL_MD = `---
name: harnesswright-harness
description: Evidence-gated operating contract for agents working in a harnesswright-managed repository — planner/implementer/verifier roles, raw-stdout evidence, one worktree per session.
---

# harnesswright harness

Use this skill when working in a repository that has adopted the
harnesswright evidence-gated harness.

## Roles

- **Planner** — breaks work into slices with a stated acceptance criterion
  and required evidence, recorded in the ledger before implementation.
- **Implementer** — writes the code or docs for one slice, then produces
  the raw evidence its gate requires.
- **Verifier** — runs the gate and reports the raw result, unedited.

## Rules

- Evidence is raw stdout only — command output, file content, exit codes,
  a verity receipt. Prose is never evidence.
- Execute only the requested step. Stop and report raw output on any
  unexpected result instead of guessing a fix.
- One git worktree per session per branch.
- Atomic Conventional Commits, explicit \`git add\` paths, hooks never
  bypassed.
`;

const PRE_COMMIT_HOOK = `#!/bin/sh
set -e
gitleaks protect --staged
`;

const WORKTREE_SH = `#!/bin/sh
set -e

usage() {
  echo "Usage: worktree.sh new <branch>" >&2
  echo "       worktree.sh list" >&2
}

cmd_new() {
  branch="$1"
  if [ -z "$branch" ]; then
    usage
    exit 2
  fi

  if git worktree list --porcelain | grep -q "^branch refs/heads/\${branch}$"; then
    echo "a worktree for branch '\${branch}' already exists" >&2
    exit 1
  fi

  repo_name=$(basename "$(git rev-parse --show-toplevel)")
  target="../\${repo_name}-\${branch}"
  git worktree add "$target" -b "$branch"
}

cmd_list() {
  git worktree list
}

case "$1" in
  new)
    cmd_new "$2"
    ;;
  list)
    cmd_list
    ;;
  *)
    usage
    exit 2
    ;;
esac
`;

const GATE_WORKFLOW_YML = `name: gate

on:
  push:
  pull_request:

jobs:
  gate:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
      - run: npx -y harnesswright gate
`;

export function renderTemplates(project: string): FileSpec[] {
  return [
    { path: ".harness/harness.json", content: harnessJson(project) },
    { path: ".harness/ledger.md", content: LEDGER_MD },
    { path: ".verity/claims.json", content: STARTER_CLAIMS_JSON },
    { path: "docs/adrs/0000-adr-template.md", content: ADR_TEMPLATE_MD },
    { path: "docs/adrs/0001-adopt-evidence-gated-harness.md", content: ADR_0001_MD },
    { path: "AGENTS.md", content: AGENTS_MD },
    { path: "SKILL.md", content: SKILL_MD },
    { path: ".githooks/pre-commit", content: PRE_COMMIT_HOOK },
    { path: "scripts/worktree.sh", content: WORKTREE_SH },
    { path: ".github/workflows/gate.yml", content: GATE_WORKFLOW_YML },
  ];
}
