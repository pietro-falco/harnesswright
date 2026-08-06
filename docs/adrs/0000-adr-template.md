---
type: adr
status: proposed
title: "<One-line claim in the imperative, not a topic>"
id: ADR-<NNN>
date: <YYYY-MM-DD>
deciders: <names>
related-adrs: [harnesswright/ADR-<NNN>]
---

<!-- DELETE THIS COMMENT ON INSTANTIATION

Form Y per vault/ADR-080 D1. This file replaces the Form H definition-list template
that stood here until 2026-08-06, under vault/ADR-080 D7. It is a template, not an
ADR: vault/ADR-080 D5 excludes `0000-adr-template.md` by name, so the placeholder
status above is a form and not a claim, and no checker judges this file.

LOCAL CONVENTIONS — this repo's, not the vault's. Read off disk, not assumed.

- Filename: `NNNN-slug.md`, FOUR digits, zero-padded. Every file in this directory
  carries it, `0001-governance-first-harness-generator.md` through
  `0007-criteria-strength-claim-trust.md`. The vault's `ADR-NNN-slug.md` spelling is
  not used here and no file is renamed: vault/ADR-051 D3 keeps counters independent
  per namespace, and vault/ADR-080 D4 records the two spellings rather than
  reconciling them.
- `id` and every cross-reference: `ADR-NNN`, THREE digits. Derived from the H1 of the
  six Accepted records — `0001` (`# ADR-001:`) through `0006` (`# ADR-006:`) — and
  corroborated by `0006`'s `Related:` line, which cites `ADR-001` through `ADR-005`
  in the same three-digit form.
- The filename carries four digits and the id carries three. That divergence is the
  convention as found, not an error to fix here.
- One record dissents. `0007-criteria-strength-claim-trust.md` writes `# ADR-0007:`,
  four digits. It is the repo's only Proposed ADR and its conversion to Form Y is a
  separate commit under vault/ADR-080's commit 4. Which spelling it takes is decided
  there, not here; this template follows the six Accepted records.
- H1 separator is a colon — `# ADR-NNN: <title>` — not the vault's em dash.
- The counter is per-namespace, and `0001` was reused after the original was deleted
  in `d4002f6`. Per vault/ADR-080 D4 a reused id whose predecessor is unreachable
  from HEAD is not a duplicate.

FRONTMATTER

- `type`, `status`, `title`, `id`, `date` are required by vault/ADR-080 D1.
  `related-adrs` is required wherever cross-references exist and uses the namespaced
  form: `harnesswright/ADR-NNN`, `vault/ADR-NNN`, `harness-pack/ADR-NNN`.
- `status` enum, literal and closed, on the authority of vault/ADR-080 D2:
  `proposed | accepted | adopted-install-deferred`, lowercase, starting at
  `proposed`. There is NO `superseded` and no `draft`. Supersession is carried by a
  `superseded-by` key while `status` stays `accepted`.
- `deciders` is optional and is kept because all seven existing ADRs in this
  directory carry it. Drop it when it would be empty.
- Placeholders use `<...>`, which needs no quoting in YAML. Keep the quotes on
  `title` and drop the angle brackets on instantiation.

FORM

- Form Y only. The `- **Status:** ...` definition list this template used to carry is
  Form H, which vault/ADR-080 D1 admits as a reading accommodation for the records
  already on disk and NOT as a permitted output. The six Accepted records keep it and
  are not edited.

SECTIONS

- The five below are this repo's own set, unchanged from the template they replace
  and matching the existing ADRs. The vault's eight-section skeleton is not imported:
  vault/ADR-080 D7 replaces this file's identity block, not its body.
-->

# ADR-<NNN>: <title>

## Context

<What problem this decision addresses, and what forces are in tension.>

## Decision

<What was decided.>

## Non-goals

<What is explicitly out of scope for this decision.>

## Alternatives considered

<What else was considered, and why it was rejected.>

## Consequences

<What becomes easier or harder as a result of this decision.>
