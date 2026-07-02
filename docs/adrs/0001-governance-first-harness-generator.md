# ADR-001: harnesswright — a governance-first harness generator for coding agents

- **Status:** Accepted
- **Date:** 2026-07-02
- **Deciders:** Pietro Falco

## Context

Coding agents now operate at scale. Anthropic's Dynamic Workflows lets Claude
Code write orchestration scripts that fan work out to parallel subagents and
validate results before they reach the user. GitHub's Spec Kit (111k+ stars)
has made Spec-Driven Development the mainstream discipline for the *intent*
side: specification → plan → tasks → implementation, with a project
"constitution" of non-negotiable principles.

Both leave the same gap open, and it is structural, not accidental:
**verification is graded by agents**. Dynamic Workflows validates agent work
with more agent work; SDD checkpoints rely on human review of artifacts the
agent produced. Neither produces deterministic, machine-checkable evidence
that the repository's literal state matches what was claimed. Two failure
classes follow:

1. **Narrative drift** — the agent's fluent summary diverges from
   `git show HEAD:<path>`, test exit codes, and file contents on disk.
2. **Workspace contamination** — concurrent sessions mutating one working
   tree, producing merge states no one authored.

[verity](https://github.com/pietro-falco/verity) (v0.1.0, published) solves
the *atomic* half: deterministic claim checking (file_exists, file_matches,
git_committed, command) with human receipts, JSON reports in in-toto
vocabulary, and exit codes 0/1/2. Missing is the *project-level* half: the
repeatable structure that decides where verification happens, how parallel
work is partitioned, and where a human must stand in the loop.

## Decision

Build **harnesswright**: a zero-runtime-dependency TypeScript CLI that
*generates* a governance-first, verification-first harness into any
repository. It sits **above** workflow and spec primitives — composing with
Dynamic Workflows and Spec-Driven Development, never replacing them — and it
**never executes an agent**.

> Specs govern intent. Workflows give agent work its shape.
> Deterministic gates give it truth. harnesswright builds the ground
> the agent walks on.

### Architecture (v0)

- **CLI, three commands:**
  - `harnesswright init [--yes] [--dry-run] [--force]` — generates the
    harness file set into the current repository. `init` computes a pure
    *plan* (typed list of file specs) before writing anything; `--dry-run`
    prints the plan and exits; existing files are never overwritten without
    `--force` (per-file). Non-interactive with `--yes`, following the CLI
    conventions users already know from comparable generators.
  - `harnesswright gate [<slice-id>]` — the deterministic slice/merge gate:
    resolves the slice's verity manifest from `.harness/harness.json` and
    delegates to `npx @pietro-falco/verity verify` (or the programmatic
    `verify()` API when verity is installed locally). Exit codes 0/1/2 are
    propagated unchanged, so `gate` composes with shell scripts and CI.
  - `harnesswright doctor` — read-only environment and hygiene checks: git
    present, hooks path active, verity resolvable, worktree hygiene
    (flags multiple checkouts of the same branch and dirty shared trees).
- **Generated harness (the product of `init`):**
  - `.harness/harness.json` — machine-readable config: workstream cap,
    slice → verity-manifest mapping, gate definitions.
  - `.harness/ledger.md` — slice ledger template (ID, deliverable,
    acceptance criteria, required evidence, gate, status).
  - `.verity/claims.json` — seeded starter manifest.
  - `docs/adrs/` — ADR template plus a pre-filled
    `0001-adopt-evidence-gated-harness.md` in **Proposed** status,
    teaching the two-commit ADR lifecycle (Proposed docs-only → review →
    Accepted) by example rather than by documentation.
  - `AGENTS.md` — cross-agent operating contract: planner / implementer /
    verifier roles, evidence rules (raw stdout only, never prose),
    hard-stop conventions, one-worktree-per-session-per-branch rule.
  - `SKILL.md` — the same contract in the open SKILL.md standard,
    consumable by Claude Code, Codex, Gemini CLI, and compatible agents.
  - `.githooks/pre-commit` + hooks bootstrap (`core.hooksPath`) — secret
    scanning (gitleaks protect --staged), never bypassable by policy.
  - `scripts/worktree.sh` — one git worktree per session per branch;
    sequential integration through gates.
  - `.github/workflows/gate.yml` — CI running `harnesswright gate` on the
    same manifests used locally: one source of truth for pass/fail.
- **Implementation constraints:** TypeScript strict, NodeNext, ES2023;
  Node built-ins only (zero runtime dependencies); engines `>=20` with CI
  matrix on Node 20/22/24; templates are embedded typed string constants
  (no template engine); tests via `node:test`; the plan/emit split keeps
  `init` unit-testable without touching the filesystem.
- **Self-hosting:** from the first releasable version this repository
  adopts its own generated harness, and its CI gate is
  `harnesswright gate` run against its own manifests.

### Scope v0 — exactly what ships

`init`, `gate`, `doctor`; the generated file set above; `docs/spec.md`
covering the `.harness/harness.json` schema and the emitted-file contract;
this repo's own `.verity/claims.json` from the first slice; SKILL.md shipped
in the npm tarball. Package name: `harnesswright` (unscoped), bin
`harnesswright`.

## Non-goals (v0)

- **No agent execution.** harnesswright never spawns or supervises an
  agent. Execution belongs to Dynamic Workflows and comparable primitives;
  harnesswright gates their results. Deterministic *coordination* —
  ledger-driven slice sequencing, merge-queue ordering, emitting
  orchestrator-facing configuration — is an explicit evolution path for
  later versions; agent execution itself is not.
- **No spec authoring.** Spec-Driven Development owns intent artifacts;
  harnesswright verifies outcomes. (A Spec Kit extension is a plausible
  future distribution channel, explicitly out of scope for v0.)
- **No LLM-as-judge.** All gates are deterministic; verdicts come from
  exit codes and literal file/git state.
- **No autonomous triggers, daemons, or always-on components.** Every
  action is operator-initiated.
- **No cryptographic signing in the tool itself.** verity's in-toto-style
  vocabulary is retained for compatibility with supply-chain attestation
  formats; signing is delegated to the ecosystem (e.g., npm provenance).
- **No cloud, no telemetry, no API keys.** Local-first is a hard
  constraint, not a phase.

## Alternatives considered

1. **Adopt or extend GitHub Spec Kit.** Rejected as a substitute: SDD
   governs specification and planning artifacts, not evidence of execution.
   Its checkpoints are human/agent reviews of agent-produced artifacts —
   exactly the layer that cannot self-certify. Compose, don't compete.
2. **Rely on Dynamic Workflows' built-in validation.** Rejected: validation
   performed by subagents inherits the failure mode it checks for, is
   platform-specific, and produces no durable machine-checkable receipt.
3. **Extend an existing orchestrator** (agent-swarm frameworks). Rejected:
   couples truth to a specific runner; the value is being the layer above
   *any* execution primitive, for any agent.
4. **Fold the generator into verity.** Rejected: verity stays a
   single-purpose, unopinionated verifier (Unix philosophy); harnesswright
   is deliberately opinionated. Composition over accretion.
5. **A template repository / cookiecutter.** Rejected: templates drift and
   carry no runtime; `gate` and `doctor` are the living half of the value.
6. **Shell scripts.** Rejected: untestable across platforms, no typed plan
   step, no npm distribution story.

## Consequences

- Positive: instant adoption (`npx harnesswright init`); one source of
  truth between local gates and CI; cross-agent portability via AGENTS.md
  and SKILL.md open standards; narrative coherence from local receipts to
  npm provenance (both speak in-toto); a credible "built with itself"
  proof from day one.
- Negative / accepted risks: **(a)** first-party platforms may absorb
  deterministic gating — mitigated by agent-independence (the moat is
  working identically for Claude Code, Codex, Gemini CLI, Cursor) and by
  staying the truth layer, never the orchestrator; **(b)** hard dependency
  on verity's CLI/API surface — mitigated by pinning a minimum version and
  testing against it in CI; **(c)** template opinionation may not fit every
  team — mitigated by `--dry-run` and per-file `--force`; **(d)** `gate`
  via npx needs network on first run — accepted for v0 to preserve zero
  dependencies; local install documented as the offline path.
