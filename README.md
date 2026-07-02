# harnesswright

[![gate](https://github.com/pietro-falco/harnesswright/actions/workflows/gate.yml/badge.svg)](https://github.com/pietro-falco/harnesswright/actions/workflows/gate.yml)
[![npm](https://img.shields.io/npm/v/harnesswright)](https://www.npmjs.com/package/harnesswright)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Specs govern intent. Workflows give agent work its shape. Deterministic
> gates give it truth. harnesswright builds the ground the agent walks on.

**An agent's "done" is a claim, not a fact.** harnesswright is a
zero-runtime-dependency CLI that generates a governance-first,
verification-first harness into any repository where coding agents work.
It never executes an agent: it shapes the structure their work must pass
through — evidence-gated slices, one worktree per session, and
deterministic merge gates powered by
[verity](https://github.com/pietro-falco/verity).

## Why

Coding agents produce confident prose about work they may not have done.
Orchestrators multiply that output; they don't verify it. The missing
layer is deterministic truth: claims reconciled against the literal
filesystem, git HEAD, and command exit codes — the same receipt whether
the work came from Claude Code, Codex, Gemini CLI, Cursor, or a human.

harnesswright installs that layer in under a minute and stays out of the
way: plain committed files, no daemon, no telemetry, no API keys.

## Quickstart (60 seconds)

```sh
cd your-repo
npx harnesswright init --dry-run   # see the exact plan, nothing written
npx harnesswright init --yes       # emit the harness (10 files, skips existing)
npx harnesswright doctor           # read-only environment checks
npx harnesswright gate             # deterministic receipt: exit 0, 1, or 2
```

Or install it as a dev dependency:

```sh
npm i -D harnesswright
```

`init` emits: an evidence-gated slice ledger (`.harness/ledger.md`), the
harness config (`.harness/harness.json`), an ADR template plus the
adoption ADR (`docs/adrs/`), a verity claims manifest
(`.verity/claims.json`), a pre-commit hook (`.githooks/pre-commit`), a
per-session worktree script (`scripts/worktree.sh`), a CI gate workflow
(`.github/workflows/gate.yml`), and the cross-agent contract
(`AGENTS.md`, `SKILL.md`). Existing files are skipped unless `--force`.

`gate` exit codes: `0` all claims pass · `1` at least one claim fails ·
`2` configuration error. Codes are propagated from verity, so CI and
local runs speak the same language.

## Where it sits

|  | [GitHub Spec Kit](https://github.com/github/spec-kit) | [Claude Code dynamic workflows](https://code.claude.com/docs/en/workflows) | harnesswright |
|---|---|---|---|
| Layer | Intent — spec → plan → tasks | Execution — orchestrates parallel subagents | Truth — deterministic evidence gates |
| How work is checked | Human review of spec artifacts | Agents adversarially review other agents | Machine reconciliation against filesystem, git HEAD, and exit codes — no model in the loop |
| Executes agents | No (your agent runs the tasks) | Yes | Never |
| Agent coupling | 30+ integrations | Claude Code | Agent-agnostic via `AGENTS.md` + `SKILL.md` open standards |

These are complements, not competitors: write intent with a spec tool,
scale execution with an orchestrator — and let a deterministic gate
decide whether "done" is true.

## Non-goals

- **Never executes or orchestrates agents.** No spawning, no scheduling,
  no prompts. See ADR-001.
- **No LLM-as-judge.** A check performed by a model is an opinion;
  a receipt is evidence.
- **Not a spec or PRD generator.** Use Spec Kit or your own process
  upstream.
- **Not a CI platform.** It emits a workflow that runs the same gate CI
  and your laptop both trust.

## Built with itself

This repository adopted its own harness at slice S7 and is gated by its
own `gate` command in CI. The receipt at HEAD is 18+ claims green — and
three of those claims exist because the harness caught its own author.
All three incidents are honest, committed history:

1. **The recursive gate (S4).** An early manifest claim ran `gate`
   itself — a self-recursive check one step from a fork bomb. The claim
   was removed and a re-entrancy guard added: `gate` exits `2` if invoked
   inside itself, and that guard is now itself a claim.
2. **The leaking guard (S7).** The re-entrancy environment variable
   leaked into descendant processes and broke unrelated test runs. Tests
   are now hermetic against an inherited `HARNESSWRIGHT_GATE`.
3. **The non-reproducible claim (S7, caught by CI).** A claim asserted
   local `core.hooksPath` configuration — true on the dev machine, false
   on every fresh clone. CI's clean checkout failed it; it was replaced
   with a check on the committed executable bit. Local truth is not
   repository truth.

The build plan lives in `.harness/ledger.md`; every slice records its
required evidence and its gate.

## Demo

`demo/osint/` is a self-contained, local-first example — a tiny OSINT
indicators dataset with a schema validator and its own claims manifest.
It exists to make the thesis concrete: the agent's prose says the data is
clean; the receipt proves it. Zero API keys, zero network.

## Security

`gate` executes the commands declared in the target repository's
`.verity/claims.json` — treat a repo's claims manifest exactly like its
npm scripts: read it before running `gate` on untrusted code. `doctor`
is read-only. See [SECURITY.md](SECURITY.md).

## Requirements

Node ≥ 20. Full build/test/gate matrix runs on Node 22 and 24 in CI,
with a Node 20 compatibility job.

## License

MIT © Pietro Falco
