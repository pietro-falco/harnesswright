# ADR-003: per-slice spec schema — an executable contract per slice

- **Status:** Proposed
- **Date:** 2026-07-10
- **Deciders:** Pietro Falco

## Context

The harness declares each slice in two places today. `.harness/harness.json`
is the machine-readable scheduling source of truth (ADR-002 authority rule:
slice sequence, per-slice `manifest`, optional `status`/`criteria`).
`.harness/ledger.md` is the human narrative and is never parsed. What neither
carries is the **contract an operator hands to an executing session**: under
which operating mode the slice runs, with which efficiency skills enabled, at
what effort, within what budget, and which conditions must stop the run.

Today those parameters live in chat prompts and operator memory. That is
prose: re-typed per session, different per agent (Claude Code, Codex, Gemini
CLI, Cursor), and unverifiable after the fact — the same narrative-drift
failure class the harness exists to remove, this time on the *input* side.
verity claims make the outcome side deterministic; ADR-002's `next` makes
readiness reporting deterministic; nothing makes the execution brief itself a
machine-readable artifact under version control.

## Decision

Introduce **per-slice specs** as executable contracts: one file per slice at
`.harness/specs/S<id>.md` (e.g. `.harness/specs/S12.md`). Each spec is a
Markdown document — the human brief lives in the body — with machine-readable
frontmatter that parameterizes the executing session. The spec is consumed by
the executing agent under the `AGENTS.md`/`SKILL.md` contract; harnesswright
validates and reports it, and never acts on it.

### Frontmatter schema

To honour ADR-001's zero-runtime-dependency constraint, frontmatter is a
**restricted YAML subset** parseable with Node built-ins only: scalar values,
flat string lists, and one-level maps. No anchors, no multi-line scalars, no
nesting beyond `budget`'s one level.

All keys are required unless stated otherwise:

- **`mode`** — `A | B`. The operating discipline the operator runs the slice
  under: `A` = attended (operator in the loop at every checkpoint), `B` =
  unattended-within-budget (the session proceeds until a stop condition
  fires). harnesswright validates enum membership only; behavioural semantics
  belong to the operating contract (`AGENTS.md`/`SKILL.md`).
- **`efficiency`** — list of efficiency-skill identifiers enabled for the
  session (e.g. `filesystem-discovery-first`, `range-limited-reads`). MAY be
  empty. Identifiers are opaque strings to harnesswright; the executing
  agent resolves them.
- **`effort`** — `low | high`. The reasoning-effort declaration for the
  session.
- **`budget`** — map with at least one of: `tokens` (positive integer),
  `turns` (positive integer), `wall_clock` (duration string, e.g. `"2h"`).
  Budget exhaustion is a stop condition by construction.
- **`stop_conditions`** — list of condition identifiers. **`gate-failure` is
  always included and is not removable**: the effective set is the declared
  list ∪ `{gate-failure}`. A parser MUST treat `gate-failure` as present even
  when omitted; there is no syntax to negate it.
- **`criteria`** — non-empty list of verity claim IDs (e.g.
  `adr-001-status-accepted`), resolved against the slice's `manifest`
  declared in `.harness/harness.json`. The claim is the authoritative text;
  the spec references it and never restates it.

Validation posture matches ADR-002's exit-2 discipline: an unknown enum
value, a missing required key, an unresolvable structure, or unknown extra
keys are configuration errors. Contracts are literal or they are broken.

### Authority and coherence rules

- `.harness/harness.json` remains the **sole** machine-readable source of
  slice sequence and completion state (ADR-002 authority rule, unchanged). A
  spec that declares `status` or ordering is a configuration error.
- `.harness/ledger.md` remains the human log and is never parsed.
- Specs never duplicate `harness.json` fields; `criteria` reference claim IDs
  rather than restating acceptance text, so there is one authoritative copy
  of every fact. A `doctor`/verity coherence check that every referenced
  claim ID resolves in the slice's manifest is a plausible follow-up, out of
  scope here.
- This ADR changes no command behaviour. Where schema validation surfaces
  (`doctor`, or a dedicated check) is an implementation-slice decision after
  Accepted.

## Non-goals

- **No execution or orchestration.** ADR-001's boundary holds verbatim:
  "harnesswright never spawns or supervises an agent." A spec parameterizes
  the session an operator launches; harnesswright neither launches nor
  supervises that session, and a spec is never an instruction *to*
  harnesswright.
- **No state writes by `next`.** `next` stays read-only per ADR-002: it never
  edits a spec, marks a slice passed, or mutates `harness.json`, whatever the
  spec declares.
- **No automatic retry on a failed gate.** `gate-failure` is a terminal stop
  condition for the session. Re-running after a failed gate is an operator
  act, never a spec-declared or tool-initiated loop.
- **No new completion-state source.** Specs describe how a slice may be
  executed, never whether it passed.

## Alternatives considered

1. **Frontmatter blocks inside `ledger.md`.** Rejected: the ledger is the
   human narrative — ADR-002 already rejected parsing it for `status` because
   that couples machine behaviour to prose formatting. Embedding
   machine-readable blocks per row reintroduces exactly that coupling, and
   makes every spec edit a diff against one shared prose file.
2. **Extend `.harness/harness.json` with the spec fields.** Seriously
   considered — the single-schema route has real advantages: one
   machine-readable file, one parser, no cross-file coherence risk, and
   `next` already reads it. Rejected nonetheless, on three grounds.
   **(a) Blast radius:** `harness.json` is the completion-state source of
   truth; mixing volatile session parameters into it means a typo in a
   `budget` field can exit-2 the scheduler. The stable scheduling record and
   the frequently-edited execution contract deserve different files.
   **(b) The body:** a spec is a contract *with prose attached* — the human
   brief belongs adjacent to the frontmatter it parameterizes, and JSON has
   no place for it. **(c) Review granularity:** file-per-slice gives atomic
   diffs and a per-spec two-commit review lifecycle, and avoids merge
   friction on one shared file if `workstreamCap` ever exceeds 1. The
   coherence risk the single schema avoids is mitigated instead by the
   no-duplication rule above and the follow-up coherence check.
3. **Keep session parameters in `AGENTS.md` prose.** Rejected: `AGENTS.md` is
   the cross-slice operating contract; it is not per-slice, carries no
   machine-readable surface, and budgets/modes vary per slice by design.

## Consequences

- **Positive:** every agent receives the same executable contract for a
  slice, under version control and diffable; stop semantics become
  deterministic — a failed gate is a defined halt, not a judgment call; the
  input side of a slice gains the same literalness verity gives the outcome
  side; specs follow the two-commit review lifecycle like ADRs, so execution
  parameters get human review before they govern a session.
- **Negative / accepted risks:** **(a)** a second machine-readable surface
  beside `harness.json` creates coherence risk — mitigated by the authority
  rules (no duplicated fields, claim IDs by reference) and the follow-up
  coherence check; **(b)** the restricted YAML subset needs a small in-repo
  parser under the zero-dependency constraint — accepted, the subset is
  deliberately trivial; **(c)** the `mode`/`effort` vocabularies are
  opinionated and may not fit every team — mitigated by Proposed-status
  review and by harnesswright treating semantics as the operating contract's
  concern, validating membership only.
