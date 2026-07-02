# harnesswright — slice ledger

Verifier is `@pietro-falco/verity` `>=0.1.0` from S1 onward. Evidence is raw
stdout only — `git show HEAD:<path>`, `cat -n`, exit codes, verity receipts —
never prose. This ledger lives at `docs/ledger.md` through S7 (self-hosting),
then migrates to `.harness/ledger.md`.

| ID | Slice | Expected atomic commits | Acceptance criteria | Required evidence | Gate |
|----|-------|--------------------------|----------------------|--------------------|------|
| S0 | Recon | read-only, no commits | Path free, verity resolvable via `npx`, global git email risk identified | Raw command output | Passed 2026-07-02 |
| S1 | Scaffold + ADR Proposed | 5 (scaffold, hooks, ADR-001, ledger, verity manifest) | Repo-local dev identity set before first commit; pre-commit hook fires; ADR committed verbatim | `git log`, `cat -n`, hook run output | Human ADR review (done in chat) |
| S2 | ADR flip + spec | 2 | `docs/spec.md` covers `harness.json` schema, emitted-file contract, gate exit codes 0/1/2 | `cat -n docs/spec.md` | Human spec review |
| S3 | init core | 3 | Pure `plan()` + `emit`, `--dry-run`/`--force`/`--yes`, embedded templates v1, `node --test` green | Test run stdout | Deterministic |
| S4 | gate command | 2 | Fixture repos: pass → 0, fail → 1, config error → 2; exit codes propagated from verity | Fixture run exit codes | Deterministic |
| S5 | doctor | 2 | Detects missing git, inactive `hooksPath`, unresolvable verity, duplicate branch checkouts; read-only | Doctor run stdout | Deterministic |
| S6 | Adoption layer | 2 | `AGENTS.md` + `SKILL.md` templates; npm files whitelist; `SKILL.md` in tarball (`npm pack --dry-run`) | `npm pack --dry-run` output | Deterministic |
| S7 | Self-hosting + CI | 2 | Repo adopts its own harness; `gate.yml` matrix Node 20/22/24; CI green | CI run link/log | Human verifies CI on GitHub |
| S8 | Publish-readiness v0.1.0 | 4 | README (thesis, 60-sec quickstart, comparison table, non-goals, built-with-itself), reproducible demo (vhs tape), `SECURITY.md` + `CHANGELOG`, release v0.1.0 | Release artifact, demo tape | Human manual npm publish + push |
| S9 | Post-publish hardening | 1 | npm trusted publishing (OIDC) + provenance, configured after first manual publish; releases stay operator-initiated via tag | npmjs.com config screenshot/log | Human configures npmjs.com |
