import { isAbsolute } from "node:path";

export type HarnessSlice = {
  title?: string;
  manifest: string;
  status?: "passed";
  passedOn?: string;
  criteria?: string[];
};

export type HarnessConfig = {
  version: "0.1";
  project: string;
  workstreamCap: number;
  slices: Record<string, HarnessSlice>;
};

const TOP_LEVEL_FIELDS = new Set(["version", "project", "workstreamCap", "slices"]);
const SLICE_FIELDS = new Set(["title", "manifest", "status", "passedOn", "criteria"]);
const SLICE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const PASSED_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseHarnessConfig(raw: string): HarnessConfig {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON in harness.json: ${(err as Error).message}`);
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("harness.json must be a JSON object");
  }

  const obj = data as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      throw new Error(`unknown field in harness.json: "${key}"`);
    }
  }

  const version = obj.version;
  if (version !== "0.1") {
    throw new Error(`harness.json version must be "0.1", got: ${JSON.stringify(version)}`);
  }

  const project = obj.project;
  if (typeof project !== "string" || project.length === 0) {
    throw new Error("harness.json project must be a non-empty string");
  }

  let workstreamCap = 1;
  const rawWorkstreamCap = obj.workstreamCap;
  if (rawWorkstreamCap !== undefined) {
    if (typeof rawWorkstreamCap !== "number" || !Number.isInteger(rawWorkstreamCap) || rawWorkstreamCap < 1) {
      throw new Error("harness.json workstreamCap must be an integer >= 1");
    }
    workstreamCap = rawWorkstreamCap;
  }

  const slices: Record<string, HarnessSlice> = {};
  const rawSlices = obj.slices;
  if (rawSlices !== undefined) {
    if (typeof rawSlices !== "object" || rawSlices === null || Array.isArray(rawSlices)) {
      throw new Error("harness.json slices must be an object");
    }

    for (const [sliceId, rawSlice] of Object.entries(rawSlices as Record<string, unknown>)) {
      if (!SLICE_KEY_PATTERN.test(sliceId)) {
        throw new Error(`invalid slice id "${sliceId}": must match ^[A-Za-z0-9_-]+$`);
      }

      if (typeof rawSlice !== "object" || rawSlice === null || Array.isArray(rawSlice)) {
        throw new Error(`slice "${sliceId}" must be an object`);
      }

      const sliceObj = rawSlice as Record<string, unknown>;

      for (const key of Object.keys(sliceObj)) {
        if (!SLICE_FIELDS.has(key)) {
          throw new Error(`unknown field in slice "${sliceId}": "${key}"`);
        }
      }

      const manifest = sliceObj.manifest;
      if (typeof manifest !== "string" || manifest.length === 0) {
        throw new Error(`slice "${sliceId}" manifest must be a non-empty string`);
      }
      if (isAbsolute(manifest)) {
        throw new Error(`slice "${sliceId}" manifest must be a relative path, got absolute: "${manifest}"`);
      }

      const title = sliceObj.title;
      if (title !== undefined && typeof title !== "string") {
        throw new Error(`slice "${sliceId}" title must be a string`);
      }

      const status = sliceObj.status;
      if (status !== undefined && status !== "passed") {
        throw new Error(`slice "${sliceId}" status must be "passed", got: ${JSON.stringify(status)}`);
      }

      const passedOn = sliceObj.passedOn;
      if (passedOn !== undefined && (typeof passedOn !== "string" || !PASSED_ON_PATTERN.test(passedOn))) {
        throw new Error(`slice "${sliceId}" passedOn must be a string in YYYY-MM-DD format`);
      }

      const criteria = sliceObj.criteria;
      if (criteria !== undefined) {
        if (!Array.isArray(criteria) || criteria.some((c) => typeof c !== "string")) {
          throw new Error(`slice "${sliceId}" criteria must be an array of strings`);
        }
      }

      const slice: HarnessSlice = { manifest };
      if (title !== undefined) slice.title = title;
      if (status !== undefined) slice.status = status;
      if (passedOn !== undefined) slice.passedOn = passedOn;
      if (criteria !== undefined) slice.criteria = criteria as string[];
      slices[sliceId] = slice;
    }
  }

  return { version: "0.1", project, workstreamCap, slices };
}
