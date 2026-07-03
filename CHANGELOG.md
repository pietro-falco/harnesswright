# Changelog

All notable changes to this project are documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org).

## [0.1.1] — 2026-07-03

### Added

- Dependabot config for `github-actions` and `npm` ecosystems (weekly).

### Changed

- `CHANGELOG.md` is now shipped inside the npm tarball (`files` whitelist).

### Security

- Trusted publishing via GitHub Actions OIDC (`id-token: write`,
  tag-triggered `release.yml`, npm 11.5.1, automatic provenance). Publishing
  stays operator-initiated via tag.
- Pinned all GitHub Actions in `release.yml` to full commit SHA.

## [0.1.0] — 2026-07-02

First public release.

### Added

- `init`: generates a 10-file governance harness — evidence-gated slice
  ledger, harness config, ADR template + adoption ADR, verity claims
  manifest, pre-commit hook, per-session worktree script, CI gate
  workflow, and the cross-agent `AGENTS.md` + `SKILL.md` contract — with
  `--dry-run`, `--force`, `--yes`.
- `gate`: deterministic merge gate powered by `@pietro-falco/verity`;
  exit codes 0 (pass) / 1 (fail) / 2 (config error), propagated from
  verity; re-entrancy guard (`HARNESSWRIGHT_GATE`).
- `doctor`: read-only environment checks — git present, hooks path
  active, verity resolvable, duplicate branch checkouts.
- Self-hosting: this repository adopts its own harness and is gated by
  its own `gate` in CI (18+ claims green at HEAD).
- OSINT demo (`demo/osint`) with its own claims manifest.
