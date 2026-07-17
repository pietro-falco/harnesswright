# harnesswright — agent session guide

## Role in the stack

Intent-layer generator: specs, slice ledgers, deterministic gates, and
harness scaffolding emitted into target repos. **Generator, never
executor** — this repo decides what work exists and whether it may
proceed; it never performs the work itself. Downstream, the
harness-pack launcher consumes `harnesswright next --json` to gate
launches.

## Build & test

```bash
npm run build   # tsc → dist/
npm test        # node --test
```

## Gate

```bash
node dist/cli.js gate    # or `harnesswright gate [slice-id]` when installed
```

A red gate is a full stop — never auto-retry.

## Template discipline

`src/templates.ts` is the single source of the `AGENTS.md`, `SKILL.md`,
and `CLAUDE.md` documents that `init` emits into target repos. Any edit
to a template constant must keep the generated documents in sync — the
constants and the files they produce must never drift apart.

## Agent contract

The authoritative execution rules for this stack live in harness-pack:
[`docs/STACK.md` § Agent contract](https://github.com/pietro-falco/harness-pack/blob/main/docs/STACK.md#agent-contract).
This file is a thin projection of that section.
