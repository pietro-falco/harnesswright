# ADR-004: Mode B execution contract — eligibility, path leases, temporal binding, model routing, closure receipts

- **Status:** Proposed
- **Date:** 2026-07-11
- **Deciders:** Pietro Falco
- **Related:** ADR-001 (execution boundary), ADR-002 (`next`, authority rule),
  ADR-003 (per-slice spec schema — **extended, not superseded**); external:
  vault ADR-050 — dual-mode operating model + vault verity
  (`80-governance/adrs/ADR-050-dual-mode-operating-model-vault-verity.md`).

## Context

ADR-003 (Accepted 2026-07-10) made the execution brief of a slice a
machine-readable artifact: per-slice specs at `.harness/specs/S<id>.md` with
frontmatter declaring `mode` (A|B), `efficiency`, `effort`, `budget`,
`stop_conditions` (with non-removable `gate-failure`), and `criteria`. That
schema parameterizes a session; it does not yet make an **unattended (Mode B)
run** decidable, safe to parallelize, or auditable after the fact:

- Nothing machine-readable says a slice **may** run unattended: spec
  lifecycle ("two-commit review, like ADRs") exists only as prose; there is
  no lock surface; eligibility would today be a judgment call over the
  ledger — exactly the prose the harness exists to replace.
- Nothing bounds what two concurrent sessions may touch. `workstreamCap`
  caps concurrency but declares no *territory*; parallel Mode B runs would
  reintroduce the workspace-contamination failure class of ADR-001.
- Two failures from the vault Mode B pilot (2026-07-11, under vault ADR-050)
  showed contract gaps rather than execution mistakes:
  1. A verifier passed 9/9 with a *true* verdict at the *wrong date*: the
     relative selection rule "older than the newest" matched 7 items at
     authoring time and 23 at execution time. The claim was literal; its
     temporal binding was not.
  2. The item-by-item triage table behind an aggregate tally was never
     committed; at the operator checkpoint it had to be regenerated from
     scratch — against state that had meanwhile moved, so the regeneration
     could not re-verify the original assertion.
- An unattended run that ends silently leaves no receipt: which stop
  condition fired, what the gate said, what was touched, what it cost.

This ADR defines the missing contracts. It is **docs-only** and changes no
command behaviour; implementation surfaces (`next --json` fields, spec
validation, `doctor` checks) are implementation slices after Accepted.

### Relationship to prior ADRs

- **ADR-001 boundary, verbatim:** "harnesswright never spawns or supervises
  an agent." Nothing here gives harnesswright a trigger, a daemon, or a
  scheduler: Mode B sessions are launched by the **operator's** scheduler
  (cron, launchd, CI) outside harnesswright. harnesswright declares and
  reports contracts; the operator's runner consumes them.
- **ADR-002 amendment, declared:** ADR-002's non-goal "no scheduling policy
  beyond linear order" deferred parallel slice graphs as "a later concern".
  D2/D4 below are that concern arriving: they add **eligibility and
  co-executability reporting** to the read-only contract. `next` remains
  read-only, exit vocabulary 0/2 unchanged, `harness.json` remains the sole
  completion-state source.
- **ADR-003 extension:** the frontmatter field set is extended (`status`,
  `scope`, `model`); no ADR-003 field is redefined. No spec files exist yet
  (`.harness/specs/` is not created), so the additions break nothing.

## Decision

### D1 — Frontmatter schema: delta over ADR-003, plus unit semantics

ADR-003's fields stand unchanged and are not restated here. This ADR:

**(a) fixes the units ADR-003 left by example.** `budget.tokens`: positive
integer, total tokens (input + output) consumed by the session as reported
by the runner. `budget.turns`: positive integer, assistant turns.
`budget.wall_clock`: duration string matching `^\d+(m|h)$`, wall time from
session start. Exhaustion of **any** declared dimension is a stop condition
(ADR-003, by construction); the receipt records which one fired (D7).

**(b) adds three fields:**

- **`status`** — `proposed | accepted` (lowercase; machine surface).
  **Required.** The spec's two-commit lifecycle, until now prose in
  ADR-003's Consequences, becomes machine-readable. Only an `accepted` spec
  may govern any session; Mode B eligibility (D2) hard-requires it.
- **`scope`** — non-empty list of repo-relative path prefixes. **Required
  when `mode: B`; optional for `mode: A`** (absent = whole-repo scope). The
  path-scoped lease of D4. The literal entry `"."` declares a whole-repo
  lease explicitly — permitted, and by D4 never co-executable.
- **`model`** — non-empty string, opaque to harnesswright. **Optional**;
  when absent, the effective value is derived deterministically from
  `effort` per the routing table in D8.

Validation posture is ADR-003's, unchanged: unknown keys, missing required
keys, or invalid values are configuration errors (exit-2 discipline).
Contracts are literal or they are broken.

### D2 — Mode B eligibility is a function of machine state only

A slice is **Mode-B-eligible** if and only if:

1. it is unlocked per the ADR-002 schedule (first non-passed in order, or in
   the co-executable set of D4 once `workstreamCap > 1`);
2. a spec exists at `.harness/specs/<id>.md`, its frontmatter parses valid
   against this schema, with `mode: B` and `status: accepted`;
3. **no lock is present** at `.harness/locks/<id>.lock`.

A lock is a file whose *presence* is the fact; its content (session
identifier + ISO-8601 timestamp) is audit-only. Locks are written and
removed by the executing session or the operator — never by harnesswright,
which only reads them. Stale-lock detection is a `doctor` follow-up, out of
scope here.

`next --json` is the reporting surface for eligibility (implementation
slice, post-Accepted). The ledger's prose is **never** consulted — this
extends ADR-002's authority rule from completion state to eligibility.

### D3 — A failed gate is a terminal stop; retries only for verdict-less infrastructure failures

Non-negotiable model rule: gate exit **1** (a verdict: the claim is false)
is a terminal stop condition, always. No auto-retry, no retry-with-tweaks,
no session-local judgment. Re-running after a failed gate is an operator
act on a reviewed change (ADR-003 non-goal, elevated here to a rule with a
distinction criterion).

Retries are admitted **only** for transient infrastructure failures,
defined as: **the gate produced no verdict** — process spawn error, verity
not resolvable (e.g. network on first `npx` run), interruption before a
verity receipt was written. The distinguishing rule is *verdict presence,
not exit code*: exit 0/1 with a verity receipt is a verdict (1 = terminal);
exit 2 conflates repo-determined configuration errors (missing manifest,
invalid `harness.json`, unknown slice — terminal: a retry cannot fix the
repo) with environmental resolver failures (transient). Classify by error
class: **retry only what a retry can change without changing the repo.**
Retries are bounded (max 2 per gate invocation) and recorded in the closure
receipt (D7).

### D4 — Path-scoped leases are the prerequisite for parallel slices

`scope` entries are repo-relative POSIX path prefixes: normalized, no
absolute paths, no `..`, no empty strings. Two slices are **co-executable**
if and only if their declared scopes are pairwise disjoint — no entry of
one is equal to or a segment-boundary prefix of an entry of the other
(`src/foo` and `src/foobar` are disjoint; `src/foo` and `src/foo/bar` are
not). Disjointness is a necessary condition, not a sufficient one:
`workstreamCap` remains the global concurrency ceiling.

**Never global pins on HEAD:** a slice must not claim "repository unchanged
at HEAD" as its lease — that serializes everything and is racy by
construction. The lease is over declared paths only. Paths touched outside
the declared scope are a recorded fact in the closure receipt (D7) — a
lease violation the operator reviews; enforcement stays with the operator
and the gate, not with harnesswright.

Globs are excluded in v1: prefix disjointness is trivially verifiable with
Node built-ins; glob disjointness requires a matching engine.

### D5 — Every mutable-state rule declares its temporal binding

Any criterion or selection rule expressed **relative to mutable state**
("older than the newest", "all files not yet migrated", "the open items")
MUST declare its binding:

- **`authoring-time`** — the selected set is enumerated **literally** in
  the spec or claim, with an as-of date. The rule's truth is frozen; the
  enumeration is the contract.
- **`execution-time`** — the check is written against state **re-evaluated
  at run time**, and the receipt records the evaluated set (D6/D7), so the
  verdict is auditable against what was actually selected.

A relative selector with no declared binding is an invalid spec — a
configuration error at validation, and a review-blocking defect in the
spec's two-commit lifecycle where machine validation cannot reach prose.
verity claims are execution-time by construction; an authoring-time set
exists only as a literal enumeration.

Design input (vault pilot, 2026-07-11): a verifier passed 9/9 with a true
verdict at the wrong date; "older than the newest" selected 7 items at
authoring time and 23 at execution time. Both bindings were defensible —
*undeclared* binding was the defect.

### D6 — Item-level verdicts are part of the receipt

The verifier's item-by-item verdict table — item identifier, evaluated
value, verdict — is **part of the receipt** and is persisted alongside the
aggregate tally, in the closure receipt (D7) or committed with the slice's
evidence. An aggregate tally alone is not re-verifiable and therefore not
evidence (the ledger's standing rule: raw output only, never prose).

Regeneration on demand is not persistence: re-running the verifier
re-evaluates against possibly mutated state (D5), so it verifies a
*different* assertion than the one the tally summarized.

Design input (vault pilot, second lesson): the item-by-item triage table
behind an aggregate tally was never committed; at the operator checkpoint
it had to be regenerated from scratch and could not re-verify the original
claim.

### D7 — Mode B closure contract: the Stop hook writes a receipt and notifies

When a Mode B session stops — **whatever** stop condition fired — the Stop
hook writes a minimal closure receipt to
`.harness/receipts/<slice-id>/<ISO-8601-UTC-timestamp>.json` containing at
least:

- slice id, session start/end timestamps;
- the stop condition that fired (including which budget dimension, when
  budget exhaustion stopped the run);
- the gate exit code, and infrastructure retries performed (D3);
- the verity report: receipt path plus item-level verdicts (D6);
- the list of touched paths, for the lease check against `scope` (D4);
- the **model actually used**, and — where the runner exposes them —
  tokens in/out. Without this field, routing efficiency (D8) is not
  auditable and D8 remains an intention.

Notification contract: the operator is notified with slice id, stop reason,
and receipt path. The channel is operator configuration, out of scope.

This is a **contract, not an implementation**: no hook code ships with this
ADR, and harnesswright never executes the hook (ADR-001 boundary). The
receipt is a machine artifact; it never lives in `ledger.md` (ADR-002: the
ledger is human narrative, never parsed).

### D8 — Model routing is declarative, never runtime

The `model` field (D1) declares which model the operator's runner should
execute the session with. It is an **opaque identifier** to harnesswright:
harnesswright declares and reports it (`next --json`); the runner consumes
it. Cross-provider values are permitted as opaque strings — the runner may
be Claude Code, Antigravity, Jules, or anything else; harnesswright knows
none of them and validates only "non-empty string".

When `model` is absent, the effective value derives **deterministically**
from `effort` — the minimum-capable-model principle:

| `effort` | default tier |
|----------|--------------|
| `low`    | worker tier  |
| `high`   | executor tier |
| —        | top tier (trust-anchor / strategic slices): **never a default** — always declared explicitly via `model` in the spec |

Tier-to-concrete-model resolution belongs to the operating contract
(`AGENTS.md`/`SKILL.md`) and runner configuration, keeping harnesswright
free of any model catalogue.

Rules:

- **(a)** Tier **escalation is never automatic** — it is a spec change,
  goes through the spec's two-commit review, and requires the operator.
- **(b)** **Downward fallback within the same tier** is admitted at the
  runner's discretion and is recorded in the closure receipt (declared
  model vs model actually used, D7).
- **(c)** Routing is a **deterministic function of spec fields**. A runtime
  router that classifies the task with an LLM is rejected outright: it is
  an agent inside the harness generator — an ADR-001 violation — and its
  verdicts would be the non-deterministic judgment this harness exists to
  remove.

## Non-goals

- **No execution or orchestration.** ADR-001 verbatim; Mode B runs are
  triggered by the operator's scheduler, never by harnesswright. No
  daemons, no watchers, no triggers.
- **No hook, lock-manager, or notification implementation.** D2/D7 define
  contracts; implementations are separate slices with their own gates.
- **No command behaviour changes in this ADR.** `gate`, `next`, `doctor`
  are untouched; implementation slices come only after Accepted.
- **No new completion-state source.** `.harness/harness.json` remains the
  sole machine-readable source of sequence and completion (ADR-002).
- **No LLM-based routing or classification.** Model selection is a
  deterministic function of spec fields (D8c).
- **No model catalogue.** harnesswright never enumerates, validates, or
  resolves model identifiers beyond "non-empty string".

## Alternatives considered

1. **Supersede ADR-003 wholesale** (restate the full schema here, flip
   ADR-003 to Superseded). Rejected in session (2026-07-11): re-deciding
   settled fields duplicates an Accepted, immutable ADR and creates two
   authoritative copies of the same facts. Delta extension keeps one home
   per decision.
2. **Eligibility from ledger prose or orchestrator judgment.** Rejected:
   prose is the narrative-drift vector the harness removes; an orchestrator
   deciding eligibility crosses the ADR-001 boundary. Eligibility is a
   predicate over files (D2).
3. **Distinguish retryable failures by exit code alone.** Rejected: exit 2
   conflates terminal configuration errors with transient resolver
   failures; the criterion is verdict presence + error class (D3).
4. **Glob-based scopes.** Rejected for v1: glob disjointness needs a
   matching engine; prefix disjointness is verifiable with built-ins (D4).
5. **Global HEAD pin as the concurrency guard.** Rejected: serializes all
   work, is racy, and negates the parallelization it claims to enable (D4).
6. **An implicit temporal-binding default** (e.g. "always execution-time").
   Rejected: the pilot's 9/9-at-the-wrong-date failure is precisely an
   undeclared binding being guessed; declaration is the contract (D5).
7. **Aggregate tally + regenerate-on-demand.** Rejected: regeneration
   re-evaluates mutated state and cannot re-verify the original assertion
   (D6).
8. **Receipts in `ledger.md`.** Rejected: the ledger is human narrative and
   is never parsed (ADR-002); receipts are machine artifacts (D7).
9. **Runtime LLM router for model selection.** Rejected outright: an agent
   inside the harness generator violates ADR-001; routing must be a
   deterministic function of spec fields (D8).

## Consequences

- **Positive:** unattended (Mode B) execution becomes a decidable predicate
  over version-controlled files instead of a judgment call; parallel slices
  gain a verifiable prerequisite (disjoint leases) without a global pin;
  every unattended run ends in a receipt that is auditable for stop reason,
  gate verdict, territory, retries, and routing cost; the
  true-verdict-wrong-date failure class is closed by declared temporal
  binding; item-level evidence survives to the operator checkpoint; model
  choice becomes reviewable spec surface instead of session folklore.
- **Negative / accepted risks:** **(a)** three new machine surfaces (spec
  `status`, locks, receipts) widen coherence risk beside `harness.json` —
  mitigated by the authority rules (harness.json sole completion source;
  ledger never parsed) and `doctor` follow-ups (stale locks, lease-receipt
  coherence); **(b)** the restricted-YAML parser and spec validator grow to
  cover the new fields — accepted, still trivially small; **(c)** the tier
  vocabulary (worker/executor/top) is opinionated — mitigated by `model`
  remaining an opaque override and semantics living in the operating
  contract; **(d)** receipts depend on runner cooperation (a Stop hook the
  runner must honour) — accepted: harnesswright can verify a receipt exists
  and is coherent, but cannot force its production; contract-first is the
  point.
