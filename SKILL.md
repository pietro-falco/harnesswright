---
name: harnesswright
description: Generate and operate a governance-first, verification-first harness for coding agents — init scaffolds evidence-gated structure, gate runs deterministic verification, doctor checks environment hygiene.
---

# harnesswright

Use this skill when a repository uses harnesswright (a `.harness/`
directory exists) or when asked to set up evidence-gated agent workflows.

## Commands

- `npx harnesswright init [--yes] [--dry-run] [--force]` — generate the
  harness file set (config, ledger, verity manifest, ADR templates,
  AGENTS.md, SKILL.md, pre-commit hook, worktree helper, CI gate).
  `--dry-run` prints the plan without writing. Existing files are never
  overwritten without `--force`.
- `npx harnesswright gate [slice-id]` — deterministic verification gate.
  Resolves the slice's verity manifest from `.harness/harness.json`
  (or `.verity/claims.json` with no argument) and delegates to verity.
  Exit codes: 0 all claims pass, 1 claims failed, 2 configuration error.
- `npx harnesswright doctor` — read-only environment checks: git, hooks
  path, verity resolvability, worktree hygiene, self-referential claims.

## Rules for agents

- Treat `gate` exit codes as the verdict. Never report success from prose.
- Never add a manifest claim that invokes `gate` or `verity verify` on the
  manifest under verification: `gate` detects re-entrancy and exits 2.
- Run `doctor` before starting work in a session; fix `fail` lines before
  proceeding.
- Follow the repository's AGENTS.md operating contract if present.
