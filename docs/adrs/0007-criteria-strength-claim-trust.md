---
type: adr
status: proposed
title: "criteria strength — HEAD-anchored trust, a two-phase gate, and a wired negative test"
id: ADR-007
date: 2026-07-17
deciders: Pietro Falco
related-adrs: [harnesswright/ADR-003, harnesswright/ADR-004, harnesswright/ADR-005, harnesswright/ADR-006]
---

# ADR-007: criteria strength — HEAD-anchored trust, a two-phase gate, and a wired negative test

- **Status:** Proposed
- **Date:** 2026-07-17 (revised 2026-07-18 after recon of `verity/src/checks.ts`)
- **Deciders:** Pietro Falco
- **Related:** ADR-003 (per-slice spec schema — extended), ADR-004 (Mode B execution contract — the gate this strengthens; D6 scoping and D8c no-LLM-judge unchanged), ADR-005 (one spec dialect — Proposed), ADR-006 (Mode B ADW-ization — the pre-gate loop D4 wires into). External: verifiable-intel `FR-001` findings F7 / N6 / N8 / F8 / F16; byte source `verity/src/checks.ts` (`checkCommand` / `checkGitCommitted`).

## Context

On 2026-07-17 a verifiable-intel Mode B run (S-VI-002) received a gate verdict of **PASS while never verifying the receipt chain** — the one artifact the slice exists to extend. The gate did exactly what ADR-004 D6 tells it to: it judged the slice's declared `criteria` and nothing else. S-VI-002's frontmatter declared a single criterion, `validate-feodo-tracker` — a `command` claim.

Recon of `verity/src/checks.ts` (2026-07-18) sharpened the diagnosis and corrected an earlier draft of this ADR. Three defects compound, and the third is deeper than first stated:

1. **Duplicated, divergent criteria (N6).** The same acceptance intent was written three times — `harness.json` prose, spec-body handles, spec-frontmatter IDs — and only the third is enforced. ADR-003's authority rule already forbids this; the duplication was reintroduced and the enforced copy drifted weakest.
2. **No coverage floor (F7).** Nothing requires the enforced criteria to cover the slice's critical artifact. A criteria set can be trivially narrow and still yield PASS.
3. **Claim trust is not flat, and the fault line is HEAD-vs-working-tree, not claim type (N8).** `checkCommand` runs `spawnSync(claim.run, { shell: true, cwd, timeout })` — the `run` string is an **arbitrary shell line** executed with verity's `cwd` (the repo the executor just wrote to). No allowlist, no sandbox. But the sharper fact is that **both the command string and the manifest that defines every claim live in `claims.json`, inside the working tree the executor controls.** An executor can rewrite a `chain-verify` claim's `run` to `echo VALID` and flip the verdict. By contrast, `checkGitCommitted` runs `git show HEAD:<path>` against `repoRoot` and matches **committed** bytes, not the working tree (`checks.test.ts` asserts this explicitly: the match applies to committed content even after the working tree diverges). Under the verifiable-intel convention that **git is operator-owned** (the executor never commits), `HEAD` is the one state an unattended executor cannot forge.

The gate mechanism is sound — the same evening, run `174200Z` shows the gate issuing STOP with four criteria ABSENT while the agent's own transcript claimed "All checks pass." The defect is on the authoring side, and the fix is to anchor acceptance on the state the executor does not control.

## Decision

### D1 — `spec.criteria` is the sole enforced acceptance surface; no restatement

The frontmatter `criteria` list (verity claim IDs) is the only acceptance authority the gate reads. `.harness/harness.json` MUST NOT carry a per-slice `criteria` field (unread, duplicative; a `doctor` check flags its presence). The spec body MAY summarize criteria as narrative, explicitly marked, never as a second contract. Closes N6.

### D2 — Coverage floor: enforced criteria must cover the slice's critical invariant

For a Mode B slice, the enforced `criteria` set MUST include a claim over each artifact the slice's ADW produces or mutates.

- **Machine-checkable** (`doctor`, ADR-003 exit-2 discipline): `criteria` is non-empty and every ID resolves to a claim in the slice's manifest.
- **Human-reviewed** (ADR-006 D3 pattern): the resolved claims assert the slice's invariant, not an unrelated one. A slice touching an append-only chain that enforces no chain-integrity criterion is a review-blocking defect.

Closes F7.

### D3 — Trust is anchored on HEAD, not on claim type

Claims differ not by "structural vs command" but by **what state they read**. The ordering, applied at authoring and review over the existing `checks.ts` types (no new verity code):

- **Anchor — `git_committed`.** Reads `git show HEAD:<path>` — committed bytes. Under git-operator-owned Mode B, this is the only state the executor cannot produce. It is the trust anchor for slice acceptance.
- **Content signal — `file_matches` (sha256/substring/regex).** Reads the working-tree file. Strong on *content* (the executor cannot forge an sha256 without producing the real bytes) but **not on provenance** — the file it reads is in the executor's write scope, and for an artifact whose content the slice itself generates, a hardcoded sha256 in the manifest is circular (the value changes every run). Additional signal, never the anchor.
- **Dynamic signal — `command`.** `spawnSync(run, { shell: true })`: an arbitrary shell line whose text *and* whose manifest entry both live in the executor-writable working tree. Useful for asserting a dynamic invariant (a verifier's exit code) **at run time**, but never load-bearing on its own, because the executor can rewrite what it does. `validate-feodo-tracker` is a `command` claim; S-VI-002 resting on it alone is the exact defect.

**Rule:** a Mode B slice's *authoritative* acceptance MUST rest on a `git_committed` claim over its critical artifact (evaluated post-commit, per D5). `command` and `file_matches` claims are permitted as run-time advisory signal, never as the sole or authoritative basis.

### D4 — Wire the verifier's own negative test as a pre-gate node

`receipt_chain.py` already ships a `selftest` that mutates and removes chain lines and asserts detection — a mutation canary that exists but is never run in the loop. For any chain-touching Mode B slice, `receipt_chain.py selftest` becomes a mandatory deterministic pre-gate node (ADR-006 D1): it proves, per run, that the verifier still detects tampering before the run's own chain is trusted. A gate with no negative test is an exit code without a proof. Closes F8.

### D5 — The authoritative gate is two-phase: working-tree advisory, then HEAD-committed authoritative

D3's anchor exposes a temporal fact. During a Mode B run the executor mutates the working tree (appends to the chain, adds claims to the manifest) and, being git-operator-owned, **does not commit**. So at gate time there is no `HEAD` yet containing the new artifact: a `git_committed` claim over it is not evaluable during the run. The run-time gate can therefore only judge working-tree state — which the executor controls — and is **inherently advisory**.

Acceptance is therefore two-phase, formalizing what S-VI-001/002 already carried as `V5`/`C5`:

1. **Run-time gate (advisory):** the launcher runs verity over the working tree; `command`/`file_matches` signal is evaluated. A failure here still stops the run (fail-closed), but a pass is not acceptance.
2. **Post-commit gate (authoritative):** after the operator commits, the operator runs the `git_committed` criteria against `HEAD`. **Only this phase accepts the slice.** This is not an add-on criterion; it is the gate. The launcher's PASS is a candidate; the operator's post-commit HEAD verify is the verdict.

The manifest-mutability problem folds in here: because `claims.json` is itself working-tree-writable and legitimately dirty mid-run (the slice adds claims), its integrity is also anchored at the post-commit phase — the committed manifest is the one whose claims count.

## Non-goals

- **No new verity claim types or verity code.** D3 is an authoring/review discipline over existing types; D1/D2's machine portion is a `doctor` check. verity's engine is untouched.
- **No LLM judgment.** Coverage adequacy (D2) and trust classification (D3) are human review or deterministic checks — never an LLM-as-judge (ADR-004 D8c verbatim).
- **No change to gate semantics.** ADR-004 D3 stands: a failed gate is terminal, never auto-retried. This ADR strengthens what criteria must be and *which phase accepts*, not the retry rule.
- **Not the ReDoS surface (F16).** `matchBuffer` builds `new RegExp(match.value, match.flags)` with no backtracking guard; a hostile regex claim could stall the gate. Low risk under a single-operator, non-adversarial manifest; noted as a separate finding, not fixed here.
- **Not the `docs/spec.md` staleness (N11).** A cited reconciliation prerequisite, not decided here.
- **No retroactive rewrite of harnesswright's own specs** (ADR-005 D1 non-translation holds). Applying this to verifiable-intel's S-VI-001/002 is a separate slice.

## Alternatives considered

1. **Gate on verity's whole report, not `spec.criteria`.** Rejected: ADR-004 D6 scopes to declared criteria on purpose (the manifest accretes across slices). The fix is stronger per-slice criteria and a HEAD-anchored phase, not a broader gate.
2. **Make the run-time gate authoritative by sandboxing `command` claims.** Rejected: sandboxing the shell does not fix manifest-mutability (the executor still authors the claim). The state boundary (HEAD vs working tree) is the real fix; D5 uses it instead of hardening the wrong layer.
3. **A bespoke chain-integrity verity type.** Rejected: configuration suffices (a `command` claim over the root-owned `receipt_chain.py` at run time; a `git_committed` claim over the chain post-commit). Least-mechanism.
4. **Ban `command` claims.** Rejected: they are the only way to assert a dynamic invariant at run time. The fix is to deny them the *anchor* role (D3/D5), not to remove them.

## Consequences

- **Positive:** acceptance is anchored on `HEAD`, the one state an unattended executor cannot forge; the run-time PASS is correctly demoted to a candidate; the operator's post-commit verify — previously folklore in `V5`/`C5` — becomes the defined authoritative gate; the chain verifier proves its own tamper-detection every run (D4). The `174200Z` false-report catch becomes the floor, not an accident.
- **Negative / accepted risks:** **(a)** acceptance now genuinely requires an operator commit + post-commit verify step — more operator involvement, but it is the step that carries the trust and it already existed informally; **(b)** run-time Mode B "green" no longer means "accepted," which must be clear in every receipt and notification to avoid a false sense of done; **(c)** D3's anchor assumes git stays operator-owned for the slice — if a future slice lets the executor commit, the anchor moves and this ADR must be revisited; **(d)** implementation is three slices (`doctor` coherence + `harness.json` check; `selftest` pre-gate node; verifiable-intel criteria reconciliation with an explicit `git_committed` authoritative criterion), and until they land, S-VI slices stay on the current weak footing.
