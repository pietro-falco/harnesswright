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
