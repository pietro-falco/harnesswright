# AGENTS.md — operating contract for coding agents in this repository

harnesswright is built with the discipline it generates. Any coding agent
working in this repository follows this contract.

## Roles

- **Planner** (human + planning assistant): writes ADRs, slices, acceptance
  criteria, and the evidence each slice must produce.
- **Implementer** (coding agent): writes code from the spec. Executes only
  the requested step. Stops at the first unexpected result and reports the
  raw error.
- **Verifier** (deterministic): `npx -y @pietro-falco/verity verify` plus
  `node --test`. Prose is never evidence.

## Evidence rules

- Evidence is raw stdout only: `git show HEAD:<path>`, `cat -n`, exit
  codes, verity receipts.
- After every file write, run `cat -n <file>` and include the output.
- Verify committed blobs with `git show HEAD:<path>`, not the working tree.

## Hard rules

- One git worktree per session per branch. Never run two agent sessions on
  the same working tree.
- Atomic Conventional Commits; stage with explicit `git add <path>`, never
  `-A`. Hooks are never bypassed (`--no-verify` is banned).
- ADRs follow the two-commit lifecycle: Proposed (docs-only) → human
  review → Accepted, then implementation.
- A verity manifest MUST NOT contain a claim that invokes `gate` or
  `verity verify` on the manifest under verification (see docs/spec.md §2).
- The slice ledger lives at docs/ledger.md; a slice is done only when its
  gate row says so.
