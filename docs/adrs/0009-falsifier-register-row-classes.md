---
type: adr
status: proposed
title: "not every row in a falsifier register is a falsifier — three classes, and ADR-008's register amended to say which is which"
id: ADR-009
date: 2026-08-08
deciders: Pietro Falco
related-adrs: [harnesswright/ADR-004, harnesswright/ADR-008, vault/ADR-073, vault/ADR-080]
---

# ADR-009: not every row in a falsifier register is a falsifier — three classes, and ADR-008's register amended to say which is which

## Context

ADR-008 carries a falsifier register whose third column is headed `The red we must see first` (`docs/adrs/0008-contribution-delta-three-phase-gate.md:141`), under a normative preamble at `:139`:

> Normative, not a schedule: each row must be **seen red** before the decision it belongs to is implemented. A row whose red has never been observed does not count as a gate.

The quantifier is universal: *each row*. Measured against the register as written, it does not hold for every row. Two rows describe an outcome that cannot be observed before the decision they belong to is implemented — not because the register is careless, but because they are doing a different job. One is a negative control: it exists to show the rule discriminates rather than blocking everything. One pins a non-behaviour: the observable is green before the change and must stay green after. Under a column that promises a first red, both read as gates that were never gated.

**Immutability is why this is a separate document.** ADR-008 is `status: accepted` in its own frontmatter. Two written rules forbid correcting it in place, and neither is cited from memory:

- `~/Obsidian-Vault/80-governance/code-execution-rules.md:34` — verbatim:
  > Accepted ADRs and closed session logs are immutable: do not "fix" stale references in them; supersede via a new ADR or an amendment.
- `docs/adrs/0000-adr-template.md:59-60` — verbatim:
  > The six Accepted records keep it and are not edited.

**ADR-008 amendment, declared:** ADR-008's register preamble binds "each row" to a red that must be seen first (`:139`), and its column is headed `The red we must see first` (`:141`). D2 below is the scope that quantifier actually has: the promise binds the FALSIFIER rows, and the two rows that are not falsifiers are named and classified instead. ADR-008 stays in force in full — every decision D1–D7 unchanged, the register's rows unchanged and not restated here, no `superseded-by` key, no edit to its frontmatter or its body.

**Where the classes come from.** The vault was searched before deciding. `vault ADR-073` D1 ratifies the falsifier norm itself — a gate ships with a fixture that makes it fail, and "a gate observed only passing is untested" — and it is `proposed`. `vault ADR-080:394` uses negative controls in practice ("The last three are negative controls and are not optional") without fixing a closed set of classes. No vault record defines a pin as a register class. The three classes are therefore decided here, at declared scope, and not imported: the citations above locate prior art, they are not dependencies, so this record does not rest on a proposed norm from another namespace.

## Decision

### D1 — A falsifier register row belongs to exactly one of three classes

- **FALSIFIER** — the outcome named is red today, and must be observed red before the decision it belongs to is implemented. This is the class ADR-008's preamble describes, and the only class the column title `The red we must see first` speaks for.
- **CONTROL** — the outcome named is one that must never be observed. The row is green before the change and green after; its evidentiary value is that the rule discriminates instead of blocking everything. A rule with no passing control is indistinguishable from a rule that rejects unconditionally.
- **PIN** — a non-behaviour fixed against regression. The observable is green on both sides of the change, and the row exists so that a later change cannot move it silently.

Scope, declared: harnesswright, falsifier registers in harnesswright ADRs. This adds no gate, no check, no fixture, no tooling, and no obligation on any register outside this repo.

### D2 — ADR-008's column title binds its FALSIFIER rows, and its two non-falsifier rows are classified

The promise carried by `The red we must see first` (`0008:141`), and the "each row must be **seen red**" obligation at `0008:139`, are read as binding the FALSIFIER rows of that register. Two rows are not falsifiers and are classified here, named by their decision and by their fixture as written, never by position:

| Row of `0008:141` — decision and fixture as written | Class | Why the promised first red is unavailable |
|---|---|---|
| D2 — baseline all-`FAIL` | CONTROL | The named outcome is "run blocked, when it must complete". An all-`FAIL` baseline is a legitimate baseline, and D2 requires the run to proceed on it. The outcome is one that must never be observed, before or after. It is the discriminating partner of D2's other row, which blocks on an *unknown* baseline rather than a *failing* one. |
| D4 — `NO_OP` run | PIN | The named outcome is "exit code differs from 0". Before D4 there is no `NO_OP` verdict to run, so the row cannot be seen red first; after D4 it must be green. A run that contributes nothing exits 0 both before and after, which is exactly the non-behaviour D4 fixes. |

The remaining rows of that register are FALSIFIER and their obligation is unchanged: each must still be seen red before its decision is implemented.

### D3 — ADR-008's lease citation is re-anchored to the fixtures that now measure it

`0008:55` cites the ordering constraint "**After the slice's path lease is held** (ADR-004 D4; the launcher's atomic lease)". The parenthetical named a mechanism with no measurement behind it. It is re-anchored to the two harness-pack fixtures that now exercise that lease, both verified present at these exact paths before being written here:

- `tests/lease_window_fixture.sh`
- `tests/lease_expiry_fixture.sh`

The constraint itself is unchanged — the baseline is still taken after the lease is held, for the reason `0008:55` gives. Only the citation gains an anchor. The fixtures are harness-pack's; this record cites them and does not create, move, or modify them.

## Non-goals

- **No edit to ADR-008.** Not its body, not its frontmatter, no `superseded-by` key. It remains `accepted` and in force, and this is an amendment rather than a supersession because nothing in it is withdrawn.
- **No restatement of ADR-008's register.** Two rows are named because they are reclassified; the register keeps one home, per the reasoning ADR-004 already recorded at `:272-276`.
- **No change to any ADR-008 decision.** D1–D7 stand exactly as accepted; this record changes what the register's column claims, not what the decisions require.
- **No new gate, check, fixture, verity claim, manifest entry, or code of any kind.** D1 is a vocabulary for reading registers, not an instrument that runs.
- **No vault-wide taxonomy.** D1's scope is harnesswright registers. Fixing these classes for the vault, or reconciling them with `vault ADR-073`, is a vault ADR and is not attempted here.
- **The `vault ADR-054 D3` drift is an open follow-up, not amended here.** The token does not appear in ADR-008. It appears in `docs/adrs/0006-mode-b-adw-ization.md` (`:24`, `:183`, `:187`, `:217`), which is a separate accepted record covered by the same immutability rule. Its correction needs its own amendment.

## Alternatives considered

1. **Edit ADR-008's register in place** (restrict the column title, add a class column). Rejected: ADR-008 is accepted, and both `code-execution-rules.md:34` and `0000-adr-template.md:59-60` forbid it. The rule exists precisely so that a record's meaning at acceptance stays readable.
2. **Supersede ADR-008 by reference**, with a `superseded-by` key. Rejected: supersession claims something was withdrawn, and nothing here is. Every decision survives; one column's quantifier is scoped and two rows are classified. Calling that supersession would misreport the delta.
3. **Restate ADR-008's register here with a class column added.** Rejected on the reasoning ADR-004 already settled at `:272-276` — restating "creates two authoritative copies of the same facts", and "Delta extension keeps one home per decision". A reader would then have two registers and no rule for which one binds.
4. **Import the classes from `vault ADR-073` instead of deciding them.** Rejected: ADR-073 D1 ratifies the falsifier norm but fixes no class set, and defines no pin. Importing a taxonomy it does not contain would be inventing a vault decision; and ADR-073 is `proposed`, so resting on it would put this record's future promotion behind another namespace's acceptance.
5. **Do nothing until the register is implemented.** Rejected: the register is normative before implementation, by its own preamble. A row that cannot deliver the red its column promises is a defect that gets more expensive once someone tries to satisfy it.

## Consequences

- A register row now states which of three jobs it is doing, so "this row has never been seen red" is answerable rather than ambiguous. For a CONTROL or a PIN it is the expected report, not a missing gate.
- ADR-008's register keeps its single home. The cost is that its reading requires this record alongside it — the standing cost of the immutability rule, paid deliberately here rather than avoided by an edit.
- The lease constraint at `0008:55` becomes checkable: a reader can open the two named fixtures instead of taking "the launcher's atomic lease" on trust.
- D1 gives later harnesswright registers a vocabulary to author in, which is cheaper than reclassifying after the fact — as this record is doing for ADR-008.
- Status is `proposed`, and promotion to `accepted` is a second commit after human review, per `AGENTS.md:29-30` and the closed status enum at `0000-adr-template.md:46-48`. No implementation is unblocked by this record in either state: it decides no instrument.
