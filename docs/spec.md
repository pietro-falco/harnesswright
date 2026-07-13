# harnesswright — spec v0.1

This document is the contract for: (1) the `.harness/harness.json` schema,
(2) the `gate` exit-code semantics, (3) the file set emitted by `init`.
Anything not specified here is undefined behavior and must not be relied on.

## 1. `.harness/harness.json`

Location: `.harness/harness.json`. The **repo root** is the parent of the
`.harness/` directory. All relative paths in this file resolve against the
repo root — never against the process working directory (same rule as
verity manifests).

Example:

```json
{
  "version": "0.1",
  "project": "my-app",
  "workstreamCap": 1,
  "slices": {
    "S1": {
      "title": "Scaffold",
      "manifest": ".verity/claims.json"
    }
  }
}
```

Fields:

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `version` | string | yes | Must be `"0.1"`. Any other value → exit 2. |
| `project` | string | yes | Non-empty. |
| `workstreamCap` | integer | no | ≥ 1. Default `1`. Advisory: `doctor` warns when active worktrees exceed it; nothing is enforced at runtime. |
| `slices` | object | no | Keys match `^[A-Za-z0-9_-]+$`. |
| `slices.<id>.title` | string | no | Human label. |
| `slices.<id>.manifest` | string | yes (per slice) | Path to a verity manifest, relative to repo root. Absolute paths → exit 2. |

Unknown fields at any level are an **error** (exit 2). v0.1 is strict by
design; forward compatibility is a future spec version's problem, not a
silent behavior.

## 2. `gate` exit codes

| Code | Meaning |
|------|---------|
| 0 | All claims in the resolved manifest passed. |
| 1 | One or more claims failed. |
| 2 | Configuration error: missing/invalid `harness.json`, unknown slice id, unresolvable or absolute manifest path, verity not resolvable, recursive gate invocation. |

`harnesswright gate` with no argument verifies `.verity/claims.json` at the
repo root. `harnesswright gate <slice-id>` resolves `slices.<id>.manifest`.
When delegation to verity succeeds, verity's exit code is propagated
**unchanged**; harnesswright adds no interpretation layer.

A manifest MUST NOT contain a claim that invokes `gate` (or `verity
verify`) on the manifest currently under verification. `gate` detects this
re-entrancy via the `HARNESSWRIGHT_GATE` environment variable and exits 2.

## 3. Emitted-file contract (`init`)

`init` computes a deterministic, lexicographically sorted **plan** before
writing anything. Each plan entry is `path + action` where action is one of
`create`, `skip` (file exists), `overwrite` (only with `--force`).
`--dry-run` prints the plan and exits 0 without touching the filesystem.
Existing files are **never** overwritten without `--force`.

| Path | Purpose |
|------|---------|
| `.harness/harness.json` | Machine-readable harness config (schema above). |
| `.harness/ledger.md` | Slice ledger template: ID, deliverable, acceptance criteria, required evidence, gate, status. |
| `.verity/claims.json` | Starter verity manifest. |
| `docs/adrs/0000-adr-template.md` | Blank ADR template. |
| `docs/adrs/0001-adopt-evidence-gated-harness.md` | Pre-filled ADR in **Proposed** status — teaches the two-commit lifecycle by example. |
| `AGENTS.md` | Cross-agent operating contract: planner/implementer/verifier roles, raw-stdout evidence rule, hard stops, one worktree per session per branch. |
| `SKILL.md` | Same contract in the open SKILL.md standard. |
| `.githooks/pre-commit` | `gitleaks protect --staged`; activated via `core.hooksPath`. |
| `scripts/worktree.sh` | One-worktree-per-session-per-branch helper. |
| `.github/workflows/gate.yml` | CI running `harnesswright gate` on the same manifests used locally. |

Template *contents* are versioned with the package, not with this spec;
this spec governs only paths, actions, and overwrite semantics.

## 4. Per-slice execution specs (`.harness/specs/S<id>.md`)

Location: `.harness/specs/S<id>.md` (e.g. `.harness/specs/S1.md`). Each spec
is a Markdown document with machine-readable frontmatter (the execution
contract) and a human-readable body (the slice brief). The frontmatter is
parsed and validated by harnesswright; the body is prose for the operator.

Example:

```markdown
---
mode: B
status: accepted
effort: low
efficiency: []
budget:
  turns: 15
  wall_clock: "30m"
stop_conditions:
  - budget-exhaustion
criteria:
  - spec-md-covers-specs-schema
  - spec-md-covers-eligibility
scope:
  - docs
  - src/spec.ts
---

# S1 — Slice title

Body text describing what this slice does, acceptance criteria, and strategy.
```

### Frontmatter schema

All keys listed below are required unless marked optional. Unknown keys are a
configuration error (exit 2).

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `mode` | string | yes | `A` or `B`. Operating discipline: `A` = attended (operator in loop), `B` = unattended-within-budget. |
| `status` | string | yes | `proposed` or `accepted`. Only `accepted` specs may govern a session. |
| `effort` | string | yes | `low` or `high`. Reasoning effort for the session. |
| `efficiency` | list of strings | yes | Efficiency-skill identifiers (e.g. `filesystem-discovery-first`). MAY be empty. Identifiers are opaque to harnesswright; the executing agent resolves them. |
| `budget` | object | yes | Map with **at least one** of: `tokens` (positive integer, input+output), `turns` (positive integer, assistant turns), `wall_clock` (duration string, e.g. `"2h"` or `"30m"`). Exhaustion of any declared dimension is a stop condition. |
| `stop_conditions` | list of strings | yes | Identifiers of conditions that halt the session (e.g. `gate-failure`, `budget-exhaustion`). **`gate-failure` is always included and cannot be removed**, whether declared or not. |
| `criteria` | list of strings | yes | Non-empty list of verity claim IDs (e.g. `adr-001-status-accepted`), resolved against the slice's manifest in `.harness/harness.json`. |
| `scope` | list of strings | no for mode A, yes for mode B | Repo-relative, normalized path prefixes (no `/`, no `..`, no empty strings). The `.` entry declares a whole-repo scope. Two slices are co-executable if their scopes are pairwise disjoint (no prefix containment). **Required when `mode: B`**. |
| `model` | string | no | Opaque model identifier (e.g. `worker`, `executor`, `claude-opus-4-8`). When absent, the effective model derives from `effort` via the routing table in D8 of ADR-004. |

Validation posture: unknown fields, missing required keys, or invalid values
cause exit 2. Contracts are literal or they are broken.

### Mode B eligibility predicate

A slice is **Mode-B-eligible** if and only if all of the following hold:

1. It is unlocked per the `.harness/harness.json` slice sequence (first
   non-passed slice, or a co-executable peer per D4 of ADR-004 when
   `workstreamCap > 1`).
2. A spec exists at `.harness/specs/<id>.md`, its frontmatter parses valid
   against this schema, with `mode: B` and `status: accepted`.
3. **No lock is present** at `.harness/locks/<id>.lock`.

Eligibility is a predicate over machine state only — never over prose in the
ledger. The `next` command reports this predicate as the `eligible_mode_b`
boolean field in its `--json` output.

### Lock surface (`.harness/locks/<id>.lock`)

A lock is a file whose *presence* signals that a session is executing the
slice. The file format is:

```
<session-id> <ISO-8601-UTC-timestamp>
```

Example:

```
runner 20260711T140847Z
```

**Rules:**

- Locks are written and removed by the executing session or the operator —
  never by harnesswright. harnesswright only reads them to check eligibility.
- The session ID and timestamp are audit-only; file *presence* is the only
  fact that carries semantics.
- Stale-lock detection and remediation are out of scope for this spec; the
  `doctor` command is a plausible implementation site.

### Receipt surface (`.harness/receipts/<id>/<timestamp>.json`)

When a Mode B session terminates, the executing session writes a closure
receipt to `.harness/receipts/<id>/<ISO-8601-UTC-timestamp>.json`. The
receipt contains at minimum (per D7 of ADR-004):

```json
{
  "slice_id": "S1",
  "session_id": "runner",
  "started_at": "2026-07-11T14:08:47Z",
  "ended_at": "2026-07-11T14:23:52Z",
  "stop_condition": "budget-exhaustion",
  "stop_detail": "wall_clock exhausted: 30m",
  "gate_exit_code": 0,
  "gate_retries": 0,
  "gate_receipt": ".verity/receipts/S1/20260711T142352Z.json",
  "item_verdicts": [...],
  "touched_paths": ["docs/spec.md", "src/spec.ts"],
  "model_declared": "low",
  "model_used": "worker",
  "tokens_input": 12500,
  "tokens_output": 3200
}
```

**Fields:**

- `slice_id`, `session_id`, `started_at`, `ended_at` — audit trail.
- `stop_condition` — the condition that halted execution (e.g.
  `gate-failure`, `budget-exhaustion`).
- `stop_detail` — when `stop_condition` is `budget-exhaustion`, which
  dimension fired (e.g. `wall_clock exhausted: 30m`).
- `gate_exit_code` — the exit code from the final `gate` invocation (0, 1,
  or 2).
- `gate_retries` — count of infrastructure retries attempted (bounded at 2
  per D3 of ADR-004).
- `gate_receipt` — path to the verity report (for audit and item-level
  verdicts).
- `item_verdicts` — the item-by-item verdict table (D6 of ADR-004): array of
  `{item_id, evaluated_value, verdict}`. This is part of the receipt so the
  verdict is re-verifiable.
- `touched_paths` — list of repo-relative paths modified or read. Used to
  audit against the `scope` lease declaration (D4 of ADR-004); lease
  violations are a reviewed fact, not enforced.
- `model_declared`, `model_used` — routing audit: the `model` field from the
  spec vs. the model the runner actually used. Downward fallback within the
  same tier is permitted.
- `tokens_input`, `tokens_output` — token count (when exposed by the runner).
  Without these, routing efficiency (D8 of ADR-004) is not auditable.

**Rules:**

- The receipt is a machine artifact; it is never hand-edited into
  `ledger.md` (ADR-002: the ledger is human narrative, never parsed).
- Notification (slice ID, stop reason, receipt path) is operator-configured,
  out of scope for this spec.
