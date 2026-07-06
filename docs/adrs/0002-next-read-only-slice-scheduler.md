# ADR-002: `next` — a read-only slice scheduler for the harness

- **Status:** Proposed
- **Date:** 2026-07-06
- **Deciders:** Pietro Falco

## Context

harnesswright ships a build plan as `.harness/ledger.md`: an ordered list of
slices, each with acceptance criteria, required evidence, and a gate. Today the
question "which slice may I start, and what is blocking it?" is answered by a
human reading the ledger. That is the one coordination step in the harness with
no deterministic surface.

ADR-001 fixed a hard boundary: harnesswright **gates** agent work but **never
executes or orchestrates** an agent. `gate` answers *"is this claim true?"*
against the literal filesystem, git HEAD, and exit codes. Nothing answers the
read-only dual: *"given what is already true, which slice is unlocked, and what
is missing before it can close?"* Answering it by hand does not scale across
agents (Claude Code, Codex, Gemini CLI, Cursor) and reintroduces the exact
narrative-drift risk the harness exists to remove — a human paraphrasing ledger
state is prose, not a receipt.

The temptation is to let an orchestrator compute the next step and run it. That
is the ADR-001 line we do not cross. What is missing is not execution; it is a
**deterministic, read-only report** of schedule state.

## Decision

Add a fourth command, `harnesswright next`, that reads the harness's declared
state and prints which slice is unlocked and what blocks it. It is the read-only
scheduling dual of `gate`: `gate` verifies a claim; `next` reports readiness. It
never executes, never advances state, never writes.

### Behaviour

- Reads `.harness/harness.json` (slice sequence, gate definitions) and the
  slice-completion state, and reports:
  - the lowest-ordered slice not yet marked passed (the **unlocked** slice);
  - for that slice, the acceptance criteria and required evidence still
    outstanding, quoted from the harness, not paraphrased;
  - a one-line reason when nothing is unlocked (all passed, or a predecessor
    gate is unmet).
- **Read-only.** `next` performs no writes, spawns no processes, and does **not**
  invoke `gate`, `verity`, or any agent. It reports declared state; it does not
  re-derive it by running checks.
- **Output.** Human-readable table by default; `--json` emits a machine-readable
  object for agent consumption, matching the `AGENTS.md`/`SKILL.md` contract.
- **Exit codes.** `0` normal (report produced, incl. the "all passed" case);
  `2` configuration error (missing/unparseable `harness.json` or ledger). No `1`:
  `next` is informational, not a pass/fail gate — keeping its exit vocabulary
  distinct from `gate`.

### Source of completion state — the open question (decide before Accepted)

The ledger `Gate` column is human-authored prose (`Passed 2026-07-02`). Parsing
markdown prose to decide "done" is fragile and couples scheduling to formatting.
Two options:

1. **Ledger-derived** (as literally described in the S10 ledger row): parse the
   ledger status column. Simplest, but re-imports prose-drift risk.
2. **Machine-readable state:** completion comes from a `status` field per slice
   in `.harness/harness.json` and/or a passing verity receipt under
   `.verity/reports/`. Robust, consistent with "receipts, not prose," at the
   cost of a small schema addition.

**Recommendation: option 2** — `next` reads a `status` field in `harness.json`
(single machine-readable source of truth); the ledger `.md` stays the human
narrative. This is the substantive decision to settle before the Accepted commit.

### Implementation shape (Accepted phase, not this commit)

A pure `schedule()` function (config + completion state → typed result)
mirroring the `plan()`/`emit` split of `init`, unit-tested with `node:test`, no
filesystem access in the pure core; a thin `next.ts` adapter reads files and
formats output. Zero new runtime dependencies, Node built-ins only. Dispatched
from `cli.ts` alongside `init`/`gate`/`doctor`, with a `USAGE` entry.

## Non-goals

- **No execution or orchestration.** `next` never runs a slice, gate, agent, or
  command. It reports; the operator acts. Preserves the ADR-001 boundary verbatim.
- **No state advance / no writes.** Never edits the ledger, marks a slice passed,
  or mutates `harness.json`. Closing a slice stays a human+`gate` act.
- **No on-demand gate re-run in v1.** A future `--verify` flag could shell out to
  `gate` for the unlocked slice; deferred to keep v1 strictly side-effect-free.
- **No scheduling policy beyond linear order.** v1 assumes the ledger's declared
  order; parallel/DAG slice graphs are a later concern.

## Alternatives considered

1. **Leave it to humans reading the ledger.** Rejected: the one non-deterministic
   coordination step; does not scale across agents; a human summary is the prose
   the harness exists to replace.
2. **Fold "what's next" into `doctor`.** Rejected: `doctor` checks *environment*
   health; schedule readiness is a different axis. Single-purpose commands are
   deliberate (per the ADR-001 verity split).
3. **Let an orchestrator compute and run the next slice.** Rejected outright:
   crosses the ADR-001 execution boundary. The value is being the read-only
   coordination layer above *any* runner.
4. **Parse ledger markdown for status.** Rejected as the *primary* mechanism
   (see open question): couples scheduling to prose formatting.

## Consequences

- **Positive:** deterministic, agent-consumable answer to "what may I start?";
  closes the last human-prose coordination gap without crossing into execution;
  `--json` gives every agent in the three-actor model the same schedule receipt;
  pure `schedule()` core stays trivially testable.
- **Negative / accepted risks:** **(a)** requires a completion-state source of
  truth — resolved by the `status`-field decision above, at the cost of a small
  `harness.json` schema addition + a migration note for v0-emitted repos;
  **(b)** a fourth command widens the CLI surface — mitigated by the strict
  read-only contract and single-purpose scope; **(c)** scope-creep risk toward
  orchestration — fenced by the explicit no-execution / no-`--verify` non-goals.
