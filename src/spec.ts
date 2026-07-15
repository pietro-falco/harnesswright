import { posix } from "node:path";

export type SpecBudget = { tokens?: number; turns?: number; wall_clock?: string };

export type SpecType = "chore" | "bug" | "feature" | "hotfix";

export type Spec = {
  mode: "A" | "B";
  efficiency: string[];
  effort: "low" | "high";
  budget: SpecBudget;
  stop_conditions: string[];
  criteria: string[];
  status: "proposed" | "accepted";
  scope?: string[];
  type?: SpecType;
  model?: string;
  tools?: string[];
};

export type EffectiveModel = { model: string; model_source: "declared" | "effort-default" };

export type EffectiveTools = { tools: string[]; tools_source: "declared" | "default" };

type Scalar = string | number;
type FrontmatterValue = Scalar | Scalar[] | Record<string, Scalar>;
type Frontmatter = Record<string, FrontmatterValue>;

const SPEC_FIELDS = new Set([
  "mode",
  "efficiency",
  "effort",
  "budget",
  "stop_conditions",
  "criteria",
  "status",
  "scope",
  "type",
  "model",
  "tools",
]);
const BUDGET_DIMENSIONS = new Set(["tokens", "turns", "wall_clock"]);
const WALL_CLOCK_PATTERN = /^\d+(m|h)$/;
const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_]*):(?:[ \t]+(.*))?$/;
const CHILD_LINE = /^ {2}(\S.*)$/;
const INTEGER = /^-?\d+$/;

/** gate-failure is always a stop condition and has no negation syntax (ADR-003). */
const GATE_FAILURE = "gate-failure";

/** D8 routing table: effort is the only input, and the top tier is never a default. */
const EFFORT_TIER: Record<Spec["effort"], string> = { low: "worker", high: "executor" };

/** ADR-005 D3: the conservative default tool ceiling when a spec declares no tools. */
const DEFAULT_TOOLS = ["Read", "Edit", "Bash", "Grep", "Glob"];

function parseScalar(raw: string, context: string): Scalar {
  const first = raw[0];
  if ((first === '"' || first === "'") && raw.length >= 2 && raw.endsWith(first)) {
    return raw.slice(1, -1);
  }
  if (INTEGER.test(raw)) {
    return Number(raw);
  }
  if (raw.includes(": ") || raw.endsWith(":")) {
    throw new Error(`spec ${context} must be a scalar, a flat list, or a one-level map`);
  }
  return raw;
}

export function parseFrontmatter(raw: string): Frontmatter {
  const lines = raw.split("\n").map((line) => line.replace(/\r$/, ""));

  if (lines[0]?.trim() !== "---") {
    throw new Error("spec must begin with a YAML frontmatter block delimited by ---");
  }

  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) {
    throw new Error("spec frontmatter block is not terminated by ---");
  }

  const fields: Frontmatter = {};

  for (let i = 1; i < end; i++) {
    const line = lines[i] as string;
    if (line.trim() === "") continue;

    const match = line.match(KEY_LINE);
    if (match === null) {
      throw new Error(`unparseable line in spec frontmatter: ${JSON.stringify(line)}`);
    }

    const key = match[1] as string;
    if (key in fields) {
      throw new Error(`duplicate field in spec: "${key}"`);
    }

    const inline = match[2]?.trim() ?? "";
    if (inline !== "") {
      fields[key] = inline === "[]" ? [] : parseScalar(inline, `"${key}"`);
      continue;
    }

    const children: string[] = [];
    while (i + 1 < end) {
      const next = lines[i + 1] as string;
      if (next.trim() === "") break;
      const child = next.match(CHILD_LINE);
      if (child === null) {
        if (next.startsWith(" ")) {
          throw new Error(`invalid indentation in spec field "${key}": ${JSON.stringify(next)}`);
        }
        break;
      }
      children.push(child[1] as string);
      i++;
    }

    if (children.length === 0) {
      throw new Error(`spec field "${key}" declares no value`);
    }

    const isList = children.every((child) => child.startsWith("- "));
    const isMap = children.every((child) => KEY_LINE.test(child));

    if (isList) {
      fields[key] = children.map((child) => parseScalar(child.slice(2).trim(), `"${key}" entry`));
    } else if (isMap) {
      const map: Record<string, Scalar> = {};
      for (const child of children) {
        const entry = child.match(KEY_LINE) as RegExpMatchArray;
        const entryKey = entry[1] as string;
        const entryValue = entry[2]?.trim() ?? "";
        if (entryKey in map) {
          throw new Error(`duplicate key "${entryKey}" in spec field "${key}"`);
        }
        if (entryValue === "") {
          throw new Error(`spec field "${key}.${entryKey}" must be a scalar`);
        }
        map[entryKey] = parseScalar(entryValue, `"${key}.${entryKey}"`);
      }
      fields[key] = map;
    } else {
      throw new Error(`spec field "${key}" mixes list entries and map keys`);
    }
  }

  return fields;
}

function requireField(fields: Frontmatter, key: string): FrontmatterValue {
  const value = fields[key];
  if (value === undefined) {
    throw new Error(`spec must declare "${key}"`);
  }
  return value;
}

function asStringList(value: FrontmatterValue, key: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`spec "${key}" must be a list`);
  }
  if (value.some((entry) => typeof entry !== "string" || entry === "")) {
    throw new Error(`spec "${key}" must be a list of non-empty strings`);
  }
  return value as string[];
}

function parseBudget(value: FrontmatterValue): SpecBudget {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("spec \"budget\" must be a map with at least one of: tokens, turns, wall_clock");
  }

  const budget: SpecBudget = {};

  for (const [dimension, raw] of Object.entries(value)) {
    if (!BUDGET_DIMENSIONS.has(dimension)) {
      throw new Error(`unknown budget dimension: "${dimension}"`);
    }

    if (dimension === "wall_clock") {
      if (typeof raw !== "string" || !WALL_CLOCK_PATTERN.test(raw)) {
        throw new Error(`spec "budget.wall_clock" must be a duration matching ^\\d+(m|h)$, got: ${JSON.stringify(raw)}`);
      }
      budget.wall_clock = raw;
      continue;
    }

    if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
      throw new Error(`spec "budget.${dimension}" must be a positive integer, got: ${JSON.stringify(raw)}`);
    }
    budget[dimension as "tokens" | "turns"] = raw;
  }

  if (Object.keys(budget).length === 0) {
    throw new Error("spec \"budget\" must declare at least one of: tokens, turns, wall_clock");
  }

  return budget;
}

function parseScope(value: FrontmatterValue): string[] {
  const entries = asStringList(value, "scope");

  if (entries.length === 0) {
    throw new Error('spec "scope" must be a non-empty list of repo-relative path prefixes');
  }

  for (const entry of entries) {
    if (entry === ".") continue;
    if (posix.isAbsolute(entry)) {
      throw new Error(`spec "scope" entry must be repo-relative, got absolute: "${entry}"`);
    }
    if (entry.split("/").includes("..")) {
      throw new Error(`spec "scope" entry must not traverse upwards with "..", got: "${entry}"`);
    }
    if (entry.endsWith("/") || posix.normalize(entry) !== entry) {
      throw new Error(`spec "scope" entry must be a normalized path prefix, got: "${entry}"`);
    }
  }

  return entries;
}

export function parseSpec(raw: string): Spec {
  const fields = parseFrontmatter(raw);

  for (const key of Object.keys(fields)) {
    if (!SPEC_FIELDS.has(key)) {
      throw new Error(`unknown field in spec: "${key}"`);
    }
  }

  const mode = requireField(fields, "mode");
  if (mode !== "A" && mode !== "B") {
    throw new Error(`spec "mode" must be "A" or "B", got: ${JSON.stringify(mode)}`);
  }

  const effort = requireField(fields, "effort");
  if (effort !== "low" && effort !== "high") {
    throw new Error(`spec "effort" must be "low" or "high", got: ${JSON.stringify(effort)}`);
  }

  const status = requireField(fields, "status");
  if (status !== "proposed" && status !== "accepted") {
    throw new Error(`spec "status" must be "proposed" or "accepted", got: ${JSON.stringify(status)}`);
  }

  const efficiency = asStringList(requireField(fields, "efficiency"), "efficiency");
  const budget = parseBudget(requireField(fields, "budget"));

  const declaredStops = asStringList(requireField(fields, "stop_conditions"), "stop_conditions");
  const stop_conditions = [...new Set([...declaredStops, GATE_FAILURE])];

  const criteria = asStringList(requireField(fields, "criteria"), "criteria");
  if (criteria.length === 0) {
    throw new Error('spec "criteria" must be a non-empty list of claim IDs');
  }

  const spec: Spec = { mode, efficiency, effort, budget, stop_conditions, criteria, status };

  if (fields.scope !== undefined) {
    spec.scope = parseScope(fields.scope);
  } else if (mode === "B") {
    throw new Error('spec must declare "scope" when mode is B');
  }

  if (fields.type !== undefined) {
    const specType = fields.type;
    if (specType !== "chore" && specType !== "bug" && specType !== "feature" && specType !== "hotfix") {
      throw new Error(`spec "type" must be one of "chore", "bug", "feature", "hotfix", got: ${JSON.stringify(specType)}`);
    }
    if (specType === "hotfix" && mode === "B") {
      throw new Error('spec "type" "hotfix" is Mode A only; the pair (type "hotfix", mode "B") is a configuration error');
    }
    spec.type = specType;
  } else if (mode === "B") {
    throw new Error('spec must declare "type" when mode is B');
  }

  if (fields.model !== undefined) {
    if (typeof fields.model !== "string" || fields.model === "") {
      throw new Error('spec "model" must be a non-empty string');
    }
    spec.model = fields.model;
  }

  if (fields.tools !== undefined) {
    spec.tools = asStringList(fields.tools, "tools");
  }

  return spec;
}

/** D8: the declared model wins; otherwise the tier derives deterministically from effort. */
export function effectiveModel(spec: Spec): EffectiveModel {
  if (spec.model !== undefined) {
    return { model: spec.model, model_source: "declared" };
  }
  return { model: EFFORT_TIER[spec.effort], model_source: "effort-default" };
}

/** ADR-005 D3: the declared tool ceiling wins; otherwise the conservative default applies. */
export function effectiveTools(spec: Spec): EffectiveTools {
  if (spec.tools !== undefined) {
    return { tools: spec.tools, tools_source: "declared" };
  }
  return { tools: [...DEFAULT_TOOLS], tools_source: "default" };
}

/** D2: eligibility is a predicate over machine state — never over ledger prose. */
export function isModeBEligible(spec: Spec | null, locked: boolean): boolean {
  return spec !== null && spec.mode === "B" && spec.status === "accepted" && !locked;
}

const MERMAID_FENCE = /^```mermaid\s*$/m;

/**
 * ADR-006 D3: a Mode B spec's body MUST contain a fenced mermaid ADW diagram.
 * Presence only — faithfulness is human review, not machine-checkable (D3).
 * No-op for Mode A. Parses the frontmatter delimiters exactly as parseFrontmatter
 * does, then searches only the body that follows the closing ---.
 */
export function validateSpecBody(raw: string, spec: Spec): void {
  if (spec.mode !== "B") {
    return;
  }

  const lines = raw.split("\n").map((line) => line.replace(/\r$/, ""));
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  const body = end === -1 ? "" : lines.slice(end + 1).join("\n");

  if (!MERMAID_FENCE.test(body)) {
    throw new Error('a mode B spec body must contain a fenced ```mermaid ADW diagram (ADR-006 D3)');
  }
}
