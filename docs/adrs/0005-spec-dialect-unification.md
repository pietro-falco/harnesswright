# ADR-005: One spec dialect — the Mode B launcher consumes `next --json` instead of parsing specs

- **Status:** Proposed
- **Date:** 2026-07-13
- **Deciders:** Pietro Falco
- **Related:** ADR-001 (execution boundary), ADR-002 (`next`, authority rule),
  ADR-003 (per-slice spec schema), ADR-004 (Mode B execution contract —
  **extended, not superseded**); external: harness-pack
  (`scripts/launch_worker.sh`, `templates/spec.template.md`,
  `templates/manifest.example.json`, `CONSTITUTION.md` v2.2.0).

## Context

Two artifacts today claim to define what a Mode B slice *is*, and they
disagree. The disagreement is not stylistic: it makes the first real Mode B
slice unlaunchable.

**Dialect 1 — ADR-003/ADR-004, implemented in `src/spec.ts`.** Frontmatter
fields `mode`, `status`, `effort`, `efficiency`, `budget` (`tokens` |
`turns` | `wall_clock`), `stop_conditions`, `criteria`, `scope`, `model`.
Parsed by `parseSpec` with a restricted-YAML parser, zero dependencies, and
exit-2 discipline: an unknown key or an invalid value is a configuration
error, never a default. This is the schema `next --json` reports and the
schema S12 shipped a validator for.

**Dialect 2 — harness-pack's `templates/spec.template.md`, implemented as a
regex scraper in `scripts/launch_worker.sh:26-38`.** Six fields, grepped
line-by-line: `id`, `tier`, `mode`, `budget.max_turns`,
`budget.wall_clock_min`, `tools`. Everything else in the file is invisible
to it. Five of the six carry a **silent default**; only `tier` is fatal
when missing.

The two dialects share exactly one field name with the same meaning
(`mode`). `.harness/specs/S13.md` — a valid ADR-003 spec, `status:
accepted`, `eligible_mode_b: true` per `next --json` — is rejected by the
launcher at `launch_worker.sh:37` (`STOP: spec missing tier`, exit 1)
before the constitution hash is even computed. The pack's own
`lint_specs.py` rejects it for three further reasons. S13 cannot be
relaunched today, and the defect is in neither artifact's logic: it is in
the absence of a decision about which one is the contract.

Worse than the hard failure are the soft ones. Because the launcher
defaults rather than fails:

- S13 declares `budget.wall_clock: "30m"`. The launcher greps
  `  wall_clock_min`, finds nothing, and defaults to **20**. A slice given
  30 minutes would be killed at 20 — silently, with a receipt that records
  the truncation as normal.
- The launcher never reads `status`. A spec still `proposed` — one that
  ADR-004 D2 forbids from governing any session — would launch.
- The launcher never reads the lock at `.harness/locks/<id>.lock`. The
  presence-only mutual exclusion of ADR-004 D2 is simply not enforced by
  the thing that starts the run.

Meanwhile `next --json` already computes all three (`status`, lock,
`eligible_mode_b`) and emits them, and no consumer reads them.

**The tier vocabularies do not meet.** harnesswright emits an *opaque
model-string*: `EFFORT_TIER = { low: "worker", high: "executor" }`
(`src/spec.ts:44`), overridable by a declared `model`. The pack's manifest
knows only `T0..T3`, each resolving to `chain[0]` — a concrete model. No
file anywhere maps `worker` to a tier. That the bridge exists informally is
proved by the S13 receipt: `model.declared: "worker"`, `model.used:
"haiku"`, while `manifest.tiers.T3.chain[0]` is `"HAIKU_CLASS_MODEL"`. The
mapping happened in an operator's head. (Collaterally: `tiers.T1.effort`
in the manifest is never read by the launcher, which consumes only `chain`,
`resolves_to`, and `manifest_version` — it is inert, and it contradicts
harnesswright's `effort: high → executor`.)

This ADR decides which dialect is the contract, and reduces the other to an
execution detail. It is **docs-only** and changes no command behaviour and
no script; `next --json` fields, the launcher's spec seam, and the manifest
key are implementation slices after Accepted.

### Relationship to prior ADRs

- **ADR-001 boundary, unchanged:** harnesswright still never spawns or
  supervises an agent. The direction of the dependency is the point: the
  *launcher* calls `next --json` and consumes it. harnesswright does not
  learn that a launcher exists.
- **ADR-002 authority rule, extended:** `next` is already the single
  read-only reporter of what may run. This ADR makes it the single reporter
  *the runner actually reads*, closing the gap where a second, weaker
  parser reached its own conclusions about the same files.
- **ADR-003/ADR-004 extension:** one optional field (`tools`, D3) is added
  to the frontmatter schema. No existing field is redefined. `.harness/specs/S13.md`
  remains valid, unmodified, as written.

## Decision

### D1 — The ADR-003/ADR-004 frontmatter is the only spec dialect in a harnesswright-governed repo

In any repository carrying `.harness/harness.json`, the per-slice spec at
`.harness/specs/<id>.md` is authoritative in the ADR-003 dialect, and
`parseSpec` is its only validator. The pack's `templates/spec.template.md`
dialect is **not** a second contract to be kept coherent: it is retired for
harnesswright-governed slices. Its fields have no standing, its silent
defaults have no standing, and no spec is ever written in both.

Corollary, binding on this ADR itself: **no existing spec is translated.**
`.harness/specs/S13.md` is already correct. The defect is in the reader.

### D2 — The launcher stops parsing specs; it consumes `next --json`

`launch_worker.sh` replaces its regex scraper (`launch_worker.sh:26-38`)
with a single call to the harnesswright CLI, and executes over what `next`
resolved:

```
harnesswright next --json   →   { id, manifest, criteria, locked,
                                  eligible_mode_b, spec: { mode, status,
                                  effort, budget, scope, model,
                                  model_source, tools, tools_source } }
```

The launcher becomes an **executor over a resolved plan**, not a second
interpreter of the same source file. It keeps every responsibility that is
genuinely its own (D6). It acquires none that belong to harnesswright.

This does not make the pack harnesswright-specific: the spec seam becomes a
*resolver*, and the harnesswright resolver is the only one implemented.
Repositories with no `.harness/harness.json` may keep the pack's own
dialect — but never for the same slice, and never in the same repo. One
repo, one dialect.

### D3 — What `next` must emit in addition: `tools`

`tools` is the one field the launcher needs and the ADR-003 schema does not
have. It is added as an **optional** frontmatter field:

- **`tools`** — list of non-empty strings (the restricted-YAML parser
  already handles flat lists). **Optional.** When absent, the effective
  value is the conservative default `["Read", "Edit", "Bash", "Grep",
  "Glob"]` — the same set the launcher defaults to today, so no run's
  authority widens by adopting this ADR.

`next --json` reports it as `spec.tools` plus `spec.tools_source`
(`declared | default`), mirroring `model` / `model_source` exactly — an
existing, tested shape (`src/next.ts:29-42`), not a new one. The launcher
joins the list with commas for `--allowedTools`.

`tools` is a **ceiling, not a grant**: the deny-list and the PreToolUse
guard in `templates/settings.mode-b.json` remain the enforcing boundary
(G3). A spec cannot widen its own authority past the guard by declaring
tools.

### D4 — What the launcher must still resolve: the concrete model. The bridge is a manifest key.

`next` emits an **opaque model-string** (`worker` | `executor` | any
declared value). The manifest maps tiers to concrete models. Nothing maps
one to the other. The bridge belongs in the **manifest**, which already
declares itself "Config, not governance … Model strings are opaque values":

```json
"model_tiers": { "worker": "T3", "executor": "T2", "top": "T1" }
```

Resolution becomes: `spec.model` → `manifest.model_tiers[spec.model]` →
`manifest.tiers[T].chain[0]`. **Fail-closed:** a model-string absent from
`model_tiers` is a STOP, never a guess and never a default tier. The
existing `resolves_to` single-hop-downward rule is untouched.

This is the only place the two vocabularies are allowed to meet, and it is
on the pack's side of the line. harnesswright gains no model catalogue —
ADR-004 D8's non-goal stands verbatim. `top` is reachable only by an
explicitly declared `model` (D8: the top tier is never a default), and `T0`
(`judgment-authoring`, empty chain) is never a resolution target.

The inert `tiers.T1.effort` key is removed by the same implementation
slice: the launcher never reads it, and it contradicts D8's routing table.

### D5 — The launcher gates on `eligible_mode_b`, not on its own opinion

`launch_worker.sh` today checks one thing about the spec: `mode = B`
(line 38). ADR-004 D2 requires three: accepted spec, unlocked slice, mode B.
`next --json` already computes the conjunction as a total predicate
(`isModeBEligible`, `src/spec.ts:277-279`).

The launcher's spec gate becomes: **`eligible_mode_b == true`, or STOP.**
This is strictly a tightening — every run the launcher accepts today that
this rule would refuse is a run ADR-004 already forbade.

### D6 — Fail-closed, and the launcher's own territory is untouched

The launcher STOPs (exit 1, no `claude` invocation) when: the CLI is not
resolvable; `next --json` exits non-zero; `kind != "unlocked"`; the
resolved `id` is not the slice requested; `spec` is absent; or
`eligible_mode_b` is false. Absence of an answer is never a default answer.

**Budget is read, never defaulted.** `budget.turns` → `--max-turns` 1:1.
`budget.wall_clock` (`^\d+(m|h)$`, ADR-004 D1) → seconds for `timeout`;
the m/h conversion is arithmetic, not a schema change. A budget dimension
the spec does not declare produces **no flag** — it does not produce a
default. The current `15`/`20` fallbacks are deleted: a silent budget is
the vector that would have given S13 twenty minutes against a declared
thirty.

Everything the pack owns stays in the pack and is untouched by this ADR:
the HALT check, the constitution hash pin (fail-closed), the constitution
injection via `--append-system-prompt`, the settings/guard wiring, and the
receipt write. Those are execution concerns; harnesswright has no opinion
about them.

## Non-goals

- **No script changes in this ADR.** Docs-only. `launch_worker.sh`,
  `src/*.ts`, and the manifest are untouched here; D2/D3/D4/D5/D6 are
  implementation slices with their own specs and gates, after Accepted.
- **No spec translation.** `.harness/specs/S13.md` is not rewritten, not
  ported, not annotated. D1 makes that a non-action by construction.
- **No model catalogue in harnesswright.** ADR-004 D8 stands: model strings
  stay opaque, and the tier bridge lives in the pack's manifest (D4).
- **No orchestration.** ADR-001 verbatim: the launcher calls harnesswright,
  never the reverse. No daemon, no trigger, no watcher.
- **No new completion-state source.** `.harness/harness.json` remains the
  sole source of sequence and completion (ADR-002).
- **Not the guard-wiring defect.** The PreToolUse hook resolves
  `$CLAUDE_PROJECT_DIR/.harness/pack/scripts/guard_pretooluse.py`, which
  does not exist in this repo (harness-sandbox has the `.harness/pack`
  symlink; harnesswright does not). G3 would not run. This is a
  **prerequisite** for any Mode B launch here and is cited, not decided:
  it is a wiring fix, not a contract question.
- **Not the unenforced turn budget.** The S13 receipt records
  `turns_used: 21` against `turns_declared: 15` with `turns_enforced:
  false`. D6 makes the declared budget reach the runner intact; whether the
  runner honours `--max-turns` is a separate defect, out of scope.

## Alternatives considered

1. **Rewrite the specs in the pack's dialect** (add `id`, `tier`,
   `max_turns`, `wall_clock_min`, `tools`, `destructive_ops`, restructure
   `criteria` to `{text, verify}`). **Rejected.** It inverts the
   dependency the wrong way: harnesswright's specs would no longer validate
   against harnesswright's own validator, so the repo would stop being
   gated by the schema it ships — the self-hosting adopted at S7
   (`.harness/ledger.md:17`, `README.md:83`) and the "built with itself"
   thesis of S8 would become false in exactly the surface that matters most.
   It also downgrades validation from `parseSpec`'s exit-2 discipline to a
   six-field regex with five silent defaults, and it leaves the two
   dialects coexisting — merely with the weaker one on top.
2. **Teach the pack's regex parser the ADR-003 dialect.** Rejected: it
   reimplements `parseSpec` in `re.search`, producing a second, weaker
   validator that must be kept in lockstep with the first. Two
   implementations of one schema is the failure this ADR exists to end;
   the fix is to have no second reader, not a better one.
3. **Keep both dialects plus a translator script.** Rejected: a third
   artifact to keep coherent with two others, and the translation is lossy
   — `criteria` (claim IDs), `manifest`, `locked`, and `eligible_mode_b`
   have no target fields in the pack dialect at all.
4. **Put the tier map (`worker → T3`) inside harnesswright.** Rejected:
   that is a model catalogue, explicitly a non-goal of ADR-004 D8, and it
   would make harnesswright aware of a specific runner's configuration.
   The map is config; it lives in the pack's manifest (D4).
5. **Have `next` launch the session directly**, removing the launcher.
   Rejected outright: ADR-001's boundary — harnesswright never spawns or
   supervises an agent.
6. **Let the launcher keep defaulting on missing budget fields.** Rejected:
   the S13 case shows the cost — a declared 30-minute budget silently
   executed as 20, with a receipt that records the truncated run as normal.
   A default that contradicts a declaration is a lie in the audit trail.

## Consequences

- **Positive:** one schema with one validator, and the spec a human reviews
  is literally the spec the runner executes. The launcher inherits
  `status`-and-lock gating for free (D5) — two ADR-004 D2 requirements it
  does not enforce today. Declared budgets reach the runner intact, and the
  silent-default class of failure is deleted rather than documented (D6).
  The tier bridge stops being folklore and becomes a fail-closed lookup in
  version-controlled config (D4). S13 becomes relaunchable **without
  touching S13** — the file was never the defect.
- **Negative / accepted risks:** **(a)** the launcher gains a hard
  dependency on the harnesswright CLI being resolvable at run time — a new
  failure mode, and a slow one on a cold `npx`; mitigated by D6's
  fail-closed posture (no CLI, no run) and, at wiring time, by pinning the
  resolution path. **(b)** `tools` becomes spec surface, so a spec can name
  the tools it runs with; mitigated because the deny-list and PreToolUse
  guard remain the enforcing boundary and `--allowedTools` is a ceiling
  (D3) — but it does mean spec review must now read one more line.
  **(c)** the pack carries a resolver seam with a harnesswright-shaped
  implementation, which is a coupling it did not have; accepted, because
  the alternative is the pack keeping its own opinion about a schema it
  does not own. **(d)** three implementation slices are created (`tools`
  in `next`; the launcher's resolver; the manifest's `model_tiers`), and
  until all three land, S13 stays unlaunchable — this ADR buys correctness,
  not speed.
