---
type: adr
status: proposed
title: "ADR-008 D1's falsifier cannot be seen red under its own premise — the premise is amended, the assertion is not"
id: ADR-010
date: 2026-08-09
deciders: Pietro Falco
related-adrs: [harnesswright/ADR-004, harnesswright/ADR-008, harnesswright/ADR-009]
---

# ADR-010: ADR-008 D1's falsifier cannot be seen red under its own premise — the premise is amended, the assertion is not

## Context

ADR-008's falsifier register opens with a universal obligation at `docs/adrs/0008-contribution-delta-three-phase-gate.md:139` — "each row must be **seen red** before the decision it belongs to is implemented" — and its first row, at `:143`, reads verbatim:

> | D1 | twin runs, criteria green at t0, one working stub / one inert | artifacts identical; no contribution verdict exists |

Three lines of D1 decide what that row can observe. All three are transcribed here from disk, not from recall.

`0008:47`, the falsifier as D1 states it — verbatim:

> *Falsifier:* two launcher runs against a tree whose criteria are already PASS, one with a working stub and one with a stub that returns immediately; the two artifacts must differ in the contribution verdict. Before implementation the assertion fails because the field does not exist - that is the red the 2026-08-07 exhibit already exhibits.

`0008:41`, the definition of the quantity the falsifier compares — verbatim:

> **Contribution** is the delta between an earlier and a later phase: the set of declared criteria whose verdict moved from `FAIL` or `ABSENT` at the earlier point to `PASS` at the later one. `ABSENT` is a legitimate starting state, because a slice that adds its own claims to the manifest begins with them absent.

`0008:45`, the ruling on the empty-delta case — verbatim:

> Re-running a slice that has already contributed yields an empty delta and `NO_OP`. That is **correct, not a regression**: the slice's work is already in the tree, and a second run genuinely contributes nothing. Stated here so it is never "fixed".

**Why the three cannot hold together for this row.** The argument is three steps and uses nothing outside the lines above.

1. `:47` fixes the tree for both twins: every declared criterion is already `PASS` at t0. That is the premise, not an incidental detail of the fixture — the row at `:143` repeats it as "criteria green at t0".
2. `:41` admits a criterion to the delta on one condition only: it moved from `FAIL` or `ABSENT` at the earlier point to `PASS` at the later one. A criterion that is `PASS` at t0 has no such move available, because `PASS` is neither `FAIL` nor `ABSENT`. The move is unavailable for *both* stubs: the working one cannot carry a criterion that is already `PASS` to `PASS`, and the inert one does nothing. The delta is therefore empty on both arms, and it is empty by definition rather than by accident of implementation.
3. `:45` gives the verdict that an empty delta yields — `NO_OP` — and forecloses the repair in the same sentence: "**correct, not a regression** … Stated here so it is never 'fixed'."

Both twins therefore produce `NO_OP`. The two artifacts do **not** differ in the contribution verdict, which is precisely what `:47` requires them to do. `:41` and `:45` are not merely in tension with `:47`; together they entail the negation of its requirement, on the tree `:47` itself specifies.

The row's red at `:143` is compound — "artifacts identical; no contribution verdict exists" — and the two conjuncts have different fates. The second is discharged the moment the field exists. The first survives that, and survives every implementation, because no implementation can make a criterion move on a tree where nothing has anywhere to move to. A row in that state is red forever and gates nothing, which is the failure `:139` names: "A row whose red has never been observed does not count as a gate" has a mirror image, a row whose red can never be *cleared*, and it is no better a gate.

**What was measured, and how far it is evidence.** That the contribution field now exists and that both twins read `NO_OP` was measured off-tree during this session's launcher repair turn, together with the discriminating case that this record's amended premise describes: a baseline of all-`FAIL` carried to all-`PASS` writes `verdict: CONTRIBUTED` with `delta: ["readme-committed","checks-pass"]`. That is reported here as a **session measurement, not as a verifiable fact** — it lives in a commit message, not in a fixture any reader can re-run. Making it repeatable is named as work in D3 below, and until that work lands this record's premise is argued rather than demonstrated.

**Immutability is why this is a separate document, again.** `0008:3` reads `status: accepted` and `0009:3` reads `status: accepted`, both measured in this turn. The rule ADR-009 quotes at its `:23-24` from the vault's `code-execution-rules.md:34` — "Accepted ADRs and closed session logs are immutable: do not 'fix' stale references in them; supersede via a new ADR or an amendment" — binds both records equally. ADR-009's own acceptance gives it no lesser standing than ADR-008's.

**ADR-008 amendment, declared.** The vehicle is the declared-amendment form ADR-004 established at `:52` ("**ADR-002 amendment, declared:**") and ADR-009 reused at its `:28`. ADR-008 stays in force in full: decisions D1–D7 unchanged, frontmatter untouched, no `superseded-by` key, no edit to its body, and its register not restated here — the single-home reasoning ADR-009 applies at its `:65`. What is amended is one premise of one falsifier, named by its decision and its text, never by position.

## Decision

### D1 — ADR-008 D1's falsifier premise is amended: the baseline must contain something that can move

The premise at `0008:47` — "a tree whose criteria are already PASS" — is replaced, for the purpose of observing D1's red, by:

> At least one declared criterion is `FAIL` or `ABSENT` at t0. The working stub carries that criterion to `PASS`; the stub that returns immediately does not.

Under this premise the twin runs separate: arm A yields `CONTRIBUTED` with a non-empty delta, arm B yields `NO_OP` with an empty delta. The two artifacts differ in the contribution verdict — which is D1's assertion, satisfied rather than weakened.

**Declared intact, and not amended by this record:**

- `0008:41`, the delta definition, in full. The amendment does not relax the `FAIL`/`ABSENT` → `PASS` condition; it supplies a baseline on which that condition can be met, which is what makes `:41` operative for this row instead of vacuous.
- `0008:45`, the empty-delta ruling, in full. The amended premise is not the case `:45` governs: `:45` is about re-running a slice that has *already* contributed, and this record neither contradicts it nor "fixes" it. On the amended premise the inert arm still yields `NO_OP`, and that `NO_OP` is still correct.
- **D1's assertion itself** — "the two artifacts must differ in the contribution verdict". This is what D1 measures, and it is untouched. The assertion was never the defect.

### D2 — The row keeps its class: it is a FALSIFIER under ADR-009 D1

ADR-009 D1 defines the class at its `:36` — verbatim:

> **FALSIFIER** — the outcome named is red today, and must be observed red before the decision it belongs to is implemented. This is the class ADR-008's preamble describes, and the only class the column title `The red we must see first` speaks for.

The row at `0008:143` is that, and stays that. This record changes the premise under which its red can be observed; it does not change what the row is doing. It is explicitly **not** reclassified to CONTROL (`0009:37`) or PIN (`0009:38`): both name outcomes that are green on both sides of the change, and D1's outcome is one that must be seen red first and then cleared. ADR-009 D2 left "the remaining rows … FALSIFIER and their obligation … unchanged" (`0009:51`); this record operates on the premise of one of those remaining rows and leaves that sentence true.

### D3 — Two obligations the acceptance commit must discharge

Neither is discharged by this record, which is docs-only. Both are named here so that acceptance is not mistaken for completion.

**(a) `0008:59` asks for an assertion, not a document.** Verbatim:

> The implementation slice measures the current order, states the three anchoring lines in its receipt, and **asserts** the shared filter path rather than documenting it.

The shared filter — the single function reducing verity's report to `spec.criteria`, required by `0008:51` so that "t0 and t1 are commensurable by construction or they are not commensurable at all" — is today described in prose and in a commit message. `:59` requires a fixture to assert the path. This turn's measurement ceiling stops at ADR-008, ADR-009, ADR-004 and the template, so this record does not open the launcher or its fixtures to characterise the assertion further; the obligation is recorded, not measured and not discharged.

**(b) The satisfiability probe must become a fixture.** The measurement quoted in the Context — all-`FAIL` at t0 carried to all-`PASS`, yielding `CONTRIBUTED` with a non-empty delta, beside its inert twin yielding `NO_OP` — exists only in a commit message. The acceptance commit makes it repeatable as the D1 arm of harness-pack's `tests/adr008_falsifier_fixture.sh`, whose path was confirmed present by listing in this turn and whose contents were not read.

## Non-goals

- **No edit to ADR-008.** Not its body, not its frontmatter, no `superseded-by` key. It stays `accepted` and in force, and this is an amendment rather than a supersession because nothing in it is withdrawn — `:41`, `:45` and D1's assertion are each declared intact above.
- **No edit to ADR-009.** It is `accepted`, and its immutability weighs exactly what ADR-008's weighs. Its D1 class set and its D2 classifications are *used* here, not revised.
- **No restatement of ADR-008's register.** One row is named by decision and by fixture text. The register keeps one home.
- **The prose paragraph currently carried in `EXPECT_D1` inside harness-pack's `tests/adr008_falsifier_fixture.sh` is a placeholder.** It records why the row is red under the old premise, which was the honest report available before this record existed. The acceptance commit replaces it with a reference to this record. That file is not opened in this turn and is not touched by this commit.
- **No code, no fixture, no schema change, no launcher change.** This record is docs-only; D3's two obligations are named, not performed.
- **No change to any other row of the register**, and no general rule about premises. One premise, one row, declared scope.

## Alternatives considered

1. **Compare something other than the contribution verdict** — the delta list, a receipt digest, the regressions field. Rejected: it weakens D1's assertion, and the verdict is the exact field D1 exists to create. `0008:43` requires the no-op to be stated "in a field rather than leaving it derivable"; a falsifier that declines to read that field does not test D1.
2. **Define the delta on something other than criterion movement.** Rejected: it contradicts `0008:41` verbatim, which is an accepted decision this record leaves standing.
3. **Reclassify the row as CONTROL or PIN under ADR-009 D1.** Rejected: measured against `0009:37-38` the row is neither — both classes name outcomes that must stay green, and D1's outcome must be seen red and then cleared. Retiring a gate's class to make a register report clean is the defect ADR-009 exists to prevent.
4. **Edit `0008:47` in place.** Rejected on the immutability rule quoted in the Context. The rule exists so that a record's meaning at acceptance stays readable.
5. **Append the amendment to ADR-009.** Rejected: ADR-009 is `accepted`, measured at `0009:3`. The same rule that forbids editing ADR-008 forbids editing ADR-009, and its acceptance is no less binding for being recent.
6. **Do nothing; carry D1 red permanently.** Rejected: a row whose red no implementation can clear stops discriminating between a working mechanism and a broken one, and `0008:139` makes the register normative precisely so that rows discriminate. Leaving it also makes the next reader's most likely repair one of alternatives 1–3, each of which damages an accepted decision.

## Consequences

- D1's red becomes reachable *and* clearable: red before implementation, green after, on a premise an implementation can actually satisfy. The register regains a gate it did not have.
- ADR-008 now requires two records beside it to read correctly — ADR-009 for its register's classes, this one for D1's premise. That is the standing cost of the immutability rule, paid deliberately rather than avoided by an edit.
- Until D3(b) lands, the evidence that the amended premise is satisfiable is a session measurement recorded in a commit message. Nobody should read acceptance of this record as evidence that the launcher discriminates; that evidence arrives with the fixture.
- D3(a) is now visible as an outstanding obligation of ADR-008 rather than an implicit one. It was already owed; this record does not create it and does not clear it.
- Status is `proposed`. Promotion to `accepted` is a second commit after human review, on the closed status enum at `0000-adr-template.md:46-48`. No implementation is unblocked while it is `proposed`: this record decides no instrument.
