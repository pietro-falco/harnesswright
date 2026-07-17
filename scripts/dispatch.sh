#!/usr/bin/env bash
# Operator-invoked, on-demand dispatcher (ADR-054 D4). No daemon, no watcher,
# no filesystem trigger, no auto-fire: this script only ever runs because a
# human typed it. A failed gate is a stop condition, never auto-retried.
#
# Reads $VAULT_HOME only; writes nothing into the vault. Every failure prints
# a G-prefixed reason to stderr and exits non-zero, in gate order:
#   G-VAULT     VAULT_HOME pin
#   G-REGISTRY  registry resolve
#   G-ELIGIBLE  launch-eligible gate
#   G-RESOLVE   target path / descriptor verify
#   G-SPEC      spec read + mode/status gate
#   G-UNLOCK    harnesswright next unlock gate
#   G-LAUNCH    launcher invocation
set -euo pipefail

usage() { echo "usage: dispatch.sh <project> <slice-id>" >&2; exit 2; }
[ $# -eq 2 ] || usage
PROJECT="$1"
SLICE_ID="$2"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  local code="$1" msg="$2"
  echo "${code}: ${msg}" >&2
  exit 1
}

# 1. VAULT_HOME pin (analogous to the launcher's HARNESS_HOME pin).
VAULT_HOME="${VAULT_HOME:-$HOME/Obsidian-Vault}"
[ -d "$VAULT_HOME" ] || fail "G-VAULT" "VAULT_HOME directory not found: $VAULT_HOME"

# 2. Registry resolve.
REGISTRY_FILE="$VAULT_HOME/80-governance/harness/targets.jsonl"
[ -f "$REGISTRY_FILE" ] || fail "G-REGISTRY" "registry file not found: $REGISTRY_FILE"

ENTRY="$(jq -c --arg proj "$PROJECT" 'select(.project == $proj)' "$REGISTRY_FILE" 2>/dev/null | head -n1 || true)"
[ -n "${ENTRY:-}" ] || fail "G-REGISTRY" "no entry for project '$PROJECT' in $REGISTRY_FILE"

# 3. Eligibility gate, before any spec is read.
ELIGIBLE="$(jq -r '.["launch-eligible"] // false' <<<"$ENTRY")"
[ "$ELIGIBLE" = "true" ] || fail "G-ELIGIBLE" "project '$PROJECT' is not launch-eligible (launch-eligible=$ELIGIBLE)"

# 4. Resolve-and-verify.
TARGET_PATH="$(jq -r '.path // empty' <<<"$ENTRY")"
[ -n "$TARGET_PATH" ] || fail "G-RESOLVE" "registry entry for '$PROJECT' has no .path"
[ -d "$TARGET_PATH" ] || fail "G-RESOLVE" "target path does not exist: $TARGET_PATH"
[ -f "$TARGET_PATH/.harness/harness.json" ] || fail "G-RESOLVE" "target lacks .harness/harness.json: $TARGET_PATH"

# 5. cd into the target, read the spec, gate on mode/status.
cd "$TARGET_PATH"
SPEC_FILE=".harness/specs/${SLICE_ID}.md"
[ -f "$SPEC_FILE" ] || fail "G-SPEC" "spec file not found: $SPEC_FILE"

FRONTMATTER="$(awk '/^---$/{c++; if (c==2) exit; next} c==1' "$SPEC_FILE")"

MODE="$(awk -F': *' '/^mode:/{print $2; exit}' <<<"$FRONTMATTER" | tr -d '"'"'"'\r')"
STATUS="$(awk -F': *' '/^status:/{print $2; exit}' <<<"$FRONTMATTER" | tr -d '"'"'"'\r')"
BUDGET_TURNS="$(sed -n '/^budget:/,/^[a-zA-Z]/p' <<<"$FRONTMATTER" | awk -F': *' '/^ +turns:/{print $2; exit}')"
BUDGET_WALL="$(sed -n '/^budget:/,/^[a-zA-Z]/p' <<<"$FRONTMATTER" | awk -F': *' '/^ +wall_clock:/{print $2; exit}' | tr -d '"'"'"'\r')"
STOP_CONDITIONS="$(sed -n '/^stop_conditions:/,/^[a-zA-Z]/p' <<<"$FRONTMATTER" | awk '/^ +- /{sub(/^ +- */,""); print}' | paste -sd, -)"

[ "$MODE" = "B" ] || fail "G-SPEC" "slice ${SLICE_ID} mode is '${MODE:-<missing>}', expected 'B'"
[ "$STATUS" = "accepted" ] || fail "G-SPEC" "slice ${SLICE_ID} status is '${STATUS:-<missing>}', expected 'accepted'"

echo "dispatch: ${PROJECT} ${SLICE_ID} — mode B, accepted, budget turns=${BUDGET_TURNS:-none} wall_clock=${BUDGET_WALL:-none}, stop_conditions=${STOP_CONDITIONS:-none}" >&2

# 6. Unlock gate: harnesswright next --json must resolve THIS slice as unlocked.
# CLI resolution mirrors launch_worker.sh's own fail-closed order (HARNESSWRIGHT_CLI
# env override, else PATH), falling back to this dispatcher's co-located repo build
# since harnesswright is not installed on PATH in this environment.
if [ -n "${HARNESSWRIGHT_CLI:-}" ]; then
  HW_CLI="$HARNESSWRIGHT_CLI"
elif command -v harnesswright >/dev/null 2>&1; then
  HW_CLI="$(command -v harnesswright)"
else
  HW_CLI="node ${SCRIPT_DIR}/../dist/cli.js"
fi

set +e
NEXT_JSON="$($HW_CLI next --json 2>&1)"
NEXT_EXIT=$?
set -e
[ "$NEXT_EXIT" -eq 0 ] || fail "G-UNLOCK" "'harnesswright next --json' exited ${NEXT_EXIT}: ${NEXT_JSON}"

NEXT_KIND="$(jq -r '.kind // empty' <<<"$NEXT_JSON" 2>/dev/null || true)"
NEXT_ID="$(jq -r '.id // empty' <<<"$NEXT_JSON" 2>/dev/null || true)"
[ "$NEXT_KIND" = "unlocked" ] && [ "$NEXT_ID" = "$SLICE_ID" ] \
  || fail "G-UNLOCK" "requested slice ${SLICE_ID} is not unlocked/next (next reports kind=${NEXT_KIND:-<none>} id=${NEXT_ID:-<none>})"

# 7. Invoke the launcher. launch_worker.sh's own usage() accepts exactly one
# positional argument, the spec file — it re-derives id, budget, and mode via
# its own `harnesswright next --json` call (ADR-005 D1/D2: it is not a second
# reader of the spec). No launcher logic is reimplemented here; the Telegram
# gate and every other launcher-side behavior fire exactly as they already do.
LAUNCHER=".harness/pack/launch_worker.sh"
[ -e ".harness/pack" ] && [ -f "$LAUNCHER" ] || fail "G-LAUNCH" "launcher not found: $LAUNCHER (symlinked pack or script missing)"

exec "$LAUNCHER" "$SPEC_FILE"
