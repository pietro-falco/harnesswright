---
type: adr
status: accepted
title: "the contribution delta — a pre-launch baseline, a three-phase gate, and a receipt that states its own no-op"
id: ADR-008
date: 2026-08-07
deciders: Pietro Falco
related-adrs: [harnesswright/ADR-003, harnesswright/ADR-004, harnesswright/ADR-007, harness-pack/ADR-005, harness-pack/ADR-006]
---

# ADR-008: the contribution delta — a pre-launch baseline, a three-phase gate, and a receipt that states its own no-op

- **Status:** Accepted
- **Accepted:** 2026-08-07
- **Date:** 2026-08-07
- **Deciders:** Pietro Falco
- **Related:** ADR-004 (Mode B execution contract — D3's retry rule, D4's leases, D6's item-level verdicts and D7's closure receipt are **extended, none redefined**), ADR-007 (criteria strength — D5's two-phase gate gains a third, earlier phase; D1-D4 untouched), ADR-003 (per-slice spec schema — unchanged). Cross-repo, qualified: **harness-pack** ADR-005 (mission-control & receipts-index, Accepted — its D4 schema-tolerant reader is why this field needs no migration, and the `tier_requested` drift it deferred is closed here as a class, not an instance); **harness-pack** ADR-006 (learning layer, Accepted — its router reward is redefined by D7 below). Byte sources read before authoring: `harness-pack/scripts/launch_worker.sh` (75-83, 164, 236, 259, 268, 272-274), `harness-pack/templates/receipt.schema.json` (3-8, 15), `harness-pack/docs/OPERATOR-GUIDE.md` (77), `harness-pack/scripts/harness_stats.py` (59-67).

## Context

On 2026-08-07 two launcher runs of the same slice, `S-DEMO`, executed against identically seeded trees whose declared criteria were **already PASS before either run started**. One did the work; the other produced nothing. Their receipts differ in `run_id`, `started_at`, `ended_at`, `session_id` — and in nothing else. Both read `subtype: success`, `gate.verdict: PASS`, `gate.reason: "all declared criteria PASS"`, `stop_reason: "gate-pass"`, `retries: 0`, with a `claims[]` array identical string for string. Exit 0 both times.

Two qualifications, so the exhibit is not over-read. Both receipts carry `tool_version: "0.0.0-fixture (stub)"`: the **launcher** is real, the executor is a stub. What is demonstrated is a property of the receipt contract, not of any model's behaviour. And `num_turns` and `total_cost_usd` are identical only because the stub injects them; on a real pair they would differ, which is exactly why they are rejected as a contribution signal in Alternatives 1.

The cause is not the gate's scoping. `launch_worker.sh:259` and `OPERATOR-GUIDE.md:77` both record the rationale — the claim manifest is repo-level and accretes across slices, so the gate reads `spec.criteria` and never verity's overall verdict — and that decision is correct and settled (ADR-004 D6; ADR-007 Alternatives 1). The defect is adjacent: being scoped to the declared criteria is **necessary but not sufficient**, because the gate evaluates the *state* of those criteria with no reference to their state before the run. A criterion green at launch is green at gate time for free. The gate reports a property of the repository, not a property of the run.

This matters now rather than later. harness-pack ADR-006 makes the gate verdict the reward of a routing layer, and not working is the cheapest way to earn it. Routing activates at slice L11; discrimination arrives at L13, one phase later. Until the receipt distinguishes a run that worked from one that did not, the reward is measurable and wrong.

ADR-007 D5 fixed *which* phase accepts: the launcher's PASS is a candidate over the executor-writable working tree, the operator's post-commit verify against HEAD is the verdict. It did not fix what any phase is compared **against**. Both defects concern trust in a PASS; they are orthogonal, and this ADR extends D5 rather than replacing it.

## Decision

### D1 - The gate is three-phase; the third phase is earlier, not later

Acceptance is evaluated at three points. The two named by ADR-007 D5 keep their roles verbatim:

- **t0 - pre-launch baseline.** Declared criteria evaluated over the target tree **before the executor is spawned**. Measurement only: t0 never accepts and never rejects.
- **t1 - run-time, working tree, advisory.** ADR-007 D5 phase 1, unchanged. Fail-closed on failure; a pass is a candidate.
- **t2 - post-commit, HEAD, authoritative.** ADR-007 D5 phase 2, unchanged. Only this phase accepts.

**Contribution** is the delta between an earlier and a later phase: the set of declared criteria whose verdict moved from `FAIL` or `ABSENT` at the earlier point to `PASS` at the later one. `ABSENT` is a legitimate starting state, because a slice that adds its own claims to the manifest begins with them absent.

A PASS with an empty delta is a **no-op**, and the artifact says so in a field rather than leaving it derivable.

Re-running a slice that has already contributed yields an empty delta and `NO_OP`. That is **correct, not a regression**: the slice's work is already in the tree, and a second run genuinely contributes nothing. Stated here so it is never "fixed".

*Falsifier:* two launcher runs against a tree whose criteria are already PASS, one with a working stub and one with a stub that returns immediately; the two artifacts must differ in the contribution verdict. Before implementation the assertion fails because the field does not exist - that is the red the 2026-08-07 exhibit already exhibits.

### D2 - t0 is measured by the launcher, under the lease, with the same runner

The baseline is computed by the launcher itself, using the runner it has **already resolved fail-closed** (`launch_worker.sh:75-83`), over the same target root and with the **same invocation form** as the run-time phase (`:268`, `node "$VERITY_CLI" verify --json` from the target root). The filter that reduces verity's report to `spec.criteria` (`:272-274`) is **one function used by both phases**, extracted rather than duplicated: t0 and t1 are commensurable by construction or they are not commensurable at all.

Ordering, stated as constraints rather than line numbers, because line numbers move:

1. **After the slice's path lease is held** (ADR-004 D4; the launcher's atomic lease). A baseline measured before the lease is measured on a tree another session may still move, and its delta is noise. This is the same failure class ADR-004 D4 rejects in the global HEAD pin.
2. **After criteria resolution** (`:164`), since the baseline is defined over the resolved criteria.
3. **Before the executor is spawned** (`:236`), since a baseline taken after the executor has written is not a baseline.

The implementation slice measures the current order, states the three anchoring lines in its receipt, and **asserts** the shared filter path rather than documenting it.

Failure posture reuses ADR-004 D3's distinguishing rule verbatim - **verdict presence, not exit code**:

- The baseline runner produced verdicts: the run proceeds, whatever they are. A t0 in which every criterion reads `FAIL` or `ABSENT` is the healthy normal case and must never stop a run.
- The baseline runner produced **no** verdict - spawn failure, unparseable output, interruption: the launcher stops **before spawning the executor**, with a distinct stop reason, and releases the lease. A run whose baseline is unknown cannot report a contribution.

*Falsifier:* a fixture pinning the runner to a script that exits non-zero and prints nothing; the launcher must stop before the executor is spawned, and the **absence of an executor invocation** is the assertion. In the same suite, a fixture whose baseline is all-`FAIL` must run to completion - the pair proves the rule discriminates rather than merely blocking.

### D3 - The receipt carries a `contribution` object, and its verdict is a total function

Extending ADR-004 D7's minimum contents, a Mode B closure receipt carries one new top-level object:

    "contribution": {
      "phase": "working-tree-advisory",
      "baseline": {
        "verdict": "FAIL",
        "claims": [
          { "id": "readme-committed", "verdict": "ABSENT" },
          { "id": "checks-pass", "verdict": "FAIL" }
        ]
      },
      "delta": ["readme-committed", "checks-pass"],
      "regressions": [],
      "verdict": "CONTRIBUTED"
    }

- **`phase`** names which pair of points the delta spans, so a reader never infers it. In a launcher-written receipt its value is always `working-tree-advisory` (t0 to t1).
- **`baseline.claims`** is the item-level verdict table at t0, **persisted, not regenerable**. ADR-004 D6 applies unchanged and for its original reason: re-running the baseline later evaluates mutated state and therefore verifies a different assertion.
- **`delta`** lists criterion IDs that moved to `PASS`. **`regressions`** lists those that moved away from it, and is **diagnostic only**: a declared criterion that regresses already fails the gate, and this object never becomes a second acceptance authority (ADR-007 D1 stands).
- **`verdict`** is a total function of the run: `CONTRIBUTED` when `delta` is non-empty, `NO_OP` when it is empty, and `NOT_EVALUATED` when **and only when** the run stopped before the gate produced any verdict. `NOT_EVALUATED` is not the silent unknown D2 forbids - that one is an unknown *baseline*, which stops the run before spawn. This one is an honest state bound to an observable condition, and it carries a cross-field invariant: `contribution.verdict == "NOT_EVALUATED"` if and only if `gate` has no verdict.

The combination that must be legible at a glance, and that no existing field expresses, is `gate.verdict: PASS` together with `contribution.verdict: NO_OP`.

*Falsifier:* three rejected receipt fixtures - `delta: []` with `verdict: "CONTRIBUTED"`; `verdict: "NOT_EVALUATED"` beside a present `gate.verdict`; and `verdict: "NO_OP"` with a non-empty `delta`. A field whose values are never all produced under test is a constant wearing a field's clothes.

### D4 - The exit code and `stop_reason` do not move, and the notification carries the verdict

The launcher's exit code keeps its present rule (`OPERATOR-GUIDE.md:77`): an executor failure dominates and is returned as is; otherwise only an all-criteria PASS is success. A `NO_OP` under `gate.verdict: PASS` **exits 0**, and `stop_reason` stays `gate-pass`.

This is deliberate. ADR-004 D3 classifies retryable versus terminal on **verdict presence** read off the gate's exit code; loading a second, orthogonal axis onto that code makes the retry rule ambiguous and turns a legitimate no-op into an infrastructure failure a runner may retry. Contribution and acceptance are different questions and stay in different fields.

Visibility is bought where it belongs: ADR-004 D7's notification contract is extended to carry `contribution.verdict` alongside slice id, stop reason, and receipt path. A no-op is loud to the operator and silent to the exit code.

*Falsifier:* a fixture asserting **exit 0** on a `NO_OP` run - a test that pins a deliberate non-behaviour. Without it, a future reader finds the no-op, judges exit 0 wrong, and breaks D3's retry classification while believing they are tightening the gate.

### D5 - The receipt is write-once; the authoritative contribution is a sibling artifact

The authoritative delta spans t0 to t2, and t2 happens **after** the operator commits - after the receipt has been written and the session has ended. It is therefore not expressible in the receipt, and must not be added by amending one: `receipt_chain.py` records the sha256 of the source file's bytes (harness-pack ADR-005), so a receipt mutated after a rollup breaks every chain line covering it.

The authoritative record is a **sibling file**, `<run_id>.acceptance.json`, written by the post-commit verify beside the receipt it refers to. The repository already carries this shape - `run-<id>.cc.json` sits beside `run-<id>.receipt.json` - so this introduces a filename, not a convention. Its contents mirror D3's object with `phase: "head-authoritative"`, and it names the commit whose HEAD it evaluated.

Because it is new, it does not inherit an old defect: any digest it carries is written as `{"alg": "sha256", "value": "..."}`, algorithm as data, never folded into a field name. The existing chain's `prev_sha256` is **not** retrofitted here and is not this ADR's business; the rule binds new artifacts only, where it is free.

This ADR fixes the contract and the reason the artifact is separate. Its implementation is a later slice, gated like any other. D1-D3 stand alone and are useful without it.

*Falsifier, at that slice:* a fixture that appends a receipt to a chain, writes the acceptance sibling, then re-verifies the chain - which must still verify. Under the rejected in-receipt design the same fixture breaks the chain, and that break is the demonstration.

### D6 - A schema's `required` list is held true by a test, not by good intentions

A required field the writer never emits is a vacuous contract: it makes every artifact invalid against its own declaration, which trains every reader to ignore the declaration. `templates/receipt.schema.json` requires `tier_requested`; the launcher no longer writes it, writing `model_string` and `tier_resolved` instead, and the 2026-08-07 exhibit confirms both facts at once. harness-pack ADR-005 D4 assigned backward compatibility to the **readers** - `harness_stats.py:63-67` implements exactly that fallback - and explicitly deferred the schema as separate housekeeping.

That deferral ends here, and it ends as a class rather than an instance. The class-closer is a test that validates a receipt **produced by the current launcher** against the schema. While that test runs, writer and declaration cannot drift silently; without it, this same repair is due again at the next field.

The commit that adds `contribution` to the schema **must, in the same commit**: drop `tier_requested` from `required` while keeping it in `properties` so older receipts stay legible; add `model_string` to `properties`; add `contribution` to both `properties` and `required`, since an optional contribution field a writer may omit reproduces the silent no-op this ADR exists to end. The schema describes what the launcher writes **now**; historical receipts are not validated against it, and are not rewritten.

Whether anything validates that schema today is not asserted here. The implementation slice measures it; the answer changes the size of the fix, never the rule.

*Falsifier:* write the validation test **first**, against a receipt the current launcher produces. It must fail, naming `tier_requested`, before it is ever red for `contribution`. A gate whose first run is green proved nothing.

### D7 - The learning layer's reward reads the contribution, never the gate verdict

harness-pack ADR-006's router is rewarded by the gate verdict. Under D1 that verdict is satisfiable without working, and the arm that does nothing is the cheapest arm on the board. The reward signal is therefore `contribution.verdict`: `CONTRIBUTED` counts, `NO_OP` does not, and a `NO_OP` under `gate.verdict: PASS` is a **negative** outcome, not a neutral one. `NOT_EVALUATED` yields no update at all - an unobserved outcome must not move a posterior.

This imposes an ordering, and it is the point of deciding now rather than at L13: **L11 must not land before the launcher writes `contribution` and the reward reads it.** Activating routing against the present reward opens a window in which the system optimises for the absence of work. The window is not a risk to be monitored - it is a predictable consequence with a known cure that is cheaper before L11 than after.

*Falsifier:* replay two runs of one arm, one `CONTRIBUTED` and one `NO_OP` under identical gate verdicts, through the reward function; the posterior must move in opposite directions. Under the present reward it moves the same way twice, and that identity is the red.

## Falsifier register

Normative, not a schedule: each row must be **seen red** before the decision it belongs to is implemented. A row whose red has never been observed does not count as a gate.

| Decision | Fixture | The red we must see first |
|---|---|---|
| D1 | twin runs, criteria green at t0, one working stub / one inert | artifacts identical; no contribution verdict exists |
| D2 | runner pinned to a silent non-zero script | executor is spawned despite an unknown baseline |
| D2 | baseline all-`FAIL` | run blocked, when it must complete |
| D3 | `delta: []` with `CONTRIBUTED`; `NOT_EVALUATED` beside a gate verdict; `NO_OP` with non-empty `delta` | all three accepted |
| D4 | `NO_OP` run | exit code differs from 0 |
| D5 | chain append, then sibling write, then re-verify | chain breaks (in-receipt design) |
| D6 | launcher-produced receipt validated against the schema | fails on `tier_requested` |
| D7 | one arm, `CONTRIBUTED` and `NO_OP` replayed | posterior moves identically |

## Non-goals

- **No change to what the gate is scoped to.** `spec.criteria` remains the sole acceptance surface (ADR-007 D1); the manifest's repo-level accretion remains the reason (ADR-004 D6). This ADR adds a comparison point, not a wider gate.
- **No change to ADR-007 D5's phase roles.** t1 stays advisory, t2 stays authoritative, t2 stays an operator act.
- **No change to the retry rule or the exit vocabulary.** ADR-004 D3 stands; D4 above pins the exit code precisely so it keeps standing.
- **No new verity claim types and no verity code.** t0 uses the existing runner, the existing invocation form, and the existing report.
- **No LLM judgment anywhere in this path.** The delta is set arithmetic over claim IDs (ADR-004 D8c verbatim).
- **No migration.** Both receipt readers access fields through `.get()`; a new key is ignored by older readers and an absent key reads as null. Existing receipts are not rewritten.
- **No attestation format adopted.** The object is shaped so it can later be projected into an external attestation predicate without restructuring - identifiable subject, explicit phase, total verdict - but no such format is adopted, emitted, or depended on here.
- **No retrofit of the existing chain's digest field naming.** D5's algorithm-as-data rule binds new artifacts only.
- **Not the receipts-directory divergence.** harness-pack ADR-005 records three defaults for where receipts live; this ADR writes where the launcher already writes and does not adjudicate that.

## Alternatives considered

1. **Use `num_turns` or `total_cost_usd` as the contribution signal.** Rejected: they measure effort, not effect. An executor can burn forty turns and satisfy nothing, and the reward would then pay for expenditure. The exhibit is silent here - its identical values are stub artefacts - which is itself why the signal cannot be trusted.
2. **Enumerate the baseline in the spec at authoring time.** Rejected by ADR-004 D5: an authoring-time enumeration freezes at authoring and the tree moves before launch. The baseline is execution-time by construction.
3. **Amend the receipt post-commit with the t2 result.** Rejected: the chain hashes the receipt's bytes, so the amendment trades integrity for locality. D5 pays one filename instead.
4. **Make the t0-to-t1 delta authoritative and skip t2.** Rejected: t1 reads the tree the executor controls (ADR-007 D3/D5). A forgeable delta is a forgeable acceptance, and the unforgeable phase already exists.
5. **Leave the delta derivable from `baseline.claims` and `claims`, with no stated verdict.** Rejected: a derivable fact no reader computes is not stated. The failure being closed is a receipt that does not distinguish; one that distinguishes only on demand does not distinguish.
6. **Make `contribution` optional in the schema.** Rejected: a writer permitted to omit it will omit it, and the silent no-op returns through the gap left open for it.
7. **Infer contribution from the touched-path list ADR-004 D7 already records.** Rejected: a touched path is not a satisfied criterion. Treating writing as achieving is the same claim-versus-fact substitution the receipt exists to prevent.
8. **Signal the no-op in the exit code.** Rejected: ADR-004 D3 reads that code to classify retryable versus terminal. Two orthogonal axes on one integer make the retry rule ambiguous and invite a runner to retry a legitimate no-op (D4).
9. **Add a `receipt_version` field instead of a validation test.** Rejected: a version number *records* drift, a test *prevents* it. Versioning would have made today's `tier_requested` divergence legal and legible rather than impossible (D6).
10. **Defer the `tier_requested` drift again, as ADR-005 D4 did.** Rejected: D6's own falsifier is a schema validation test, and that test can never go green while a required field is never written. The deferral is cheap only while nothing else touches the file - and this ADR touches it.
11. **Measure t0 before taking the lease, to shorten the lease hold.** Rejected: an unleased baseline can be invalidated by a concurrent session between measurement and spawn, making every delta unreliable in exactly the parallel case leases exist to enable (D2).

## Consequences

- **Positive:** a Mode B receipt distinguishes a run that changed something from one that did not, and says which rather than leaving it to be reconstructed; the baseline is item-level and persisted, so the delta is re-verifiable against what was actually selected; the learning layer gains a reward that cannot be earned by inaction, and gains it before the routing that would exploit the gap is switched on; the schema stops requiring a field nobody writes and starts being a declaration a test holds it to; ADR-007's two phases keep their meanings and acquire the comparison point they were missing; the new artifact is born without the algorithm-in-the-field-name defect.
- **Negative / accepted risks:** **(a)** every Mode B run pays one extra runner invocation before the executor starts, inside the lease window - accepted: it is the same command the gate already runs, and a run whose baseline is unknown is a run whose result is uninterpretable; **(b)** the lease is held marginally longer, reducing parallel throughput slightly - accepted, and cheaper than an unreliable delta; **(c)** the receipt grows an object scaling with the criteria count - bounded by the same list the gate already reports item-level, and additive for readers by ADR-005 D4; **(d)** the authoritative contribution lives in a second file, so a full picture means opening two - preferred to a mutable receipt under a hash chain; **(e)** D7 imposes an ordering on harness-pack's slice plan that did not previously exist, and L11 waits on work in another repository - accepted: the alternative is a measured window in which the cheapest arm is the one that does nothing; **(f)** t0 and t1 are commensurable only while both use one filter implementation - the implementation slice asserts the shared path rather than documenting it, because a documented invariant is not an invariant.
- **Where this lands if it is wrong:** the failure to watch is a `contribution.verdict` reading `CONTRIBUTED` on every run, which would mean the baseline is computed after the executor has already moved the tree. The `NO_OP` value appearing under test, on purpose, is what keeps that from being invisible - a value never observed is a value never proven, and a receipt that has never said `NO_OP` has not yet earned the right to say `CONTRIBUTED`. The exhibit that opened this ADR is two receipts that agree; the artefact it exists to produce is two receipts that disagree, where one of them says: this run was a no-op, and the receipt says so.
