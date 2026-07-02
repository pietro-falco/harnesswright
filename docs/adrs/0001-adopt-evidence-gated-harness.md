# ADR-0001: Adopt an evidence-gated harness

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
