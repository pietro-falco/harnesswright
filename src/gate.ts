import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseHarnessConfig } from "./harness.ts";

const DEFAULT_MANIFEST_PATH = ".verity/claims.json";

function runVerity(manifestPath: string, cwd: string): number {
  const result = spawnSync("npx", ["-y", "@pietro-falco/verity", "verify", manifestPath], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, HARNESSWRIGHT_GATE: "1" },
  });

  if (result.error || result.status === null) {
    process.stderr.write("verity not resolvable\n");
    return 2;
  }

  return result.status;
}

export function runGate(sliceId: string | undefined, cwd: string): number {
  if (process.env.HARNESSWRIGHT_GATE === "1") {
    process.stderr.write(
      "recursive gate invocation detected: a claim in the manifest invokes gate on the manifest under verification (see docs/spec.md §2)\n",
    );
    return 2;
  }

  if (sliceId === undefined) {
    if (!existsSync(join(cwd, DEFAULT_MANIFEST_PATH))) {
      process.stderr.write(`manifest not found: ${DEFAULT_MANIFEST_PATH}\n`);
      return 2;
    }
    return runVerity(DEFAULT_MANIFEST_PATH, cwd);
  }

  const harnessPath = join(cwd, ".harness/harness.json");
  if (!existsSync(harnessPath)) {
    process.stderr.write("harness config not found: .harness/harness.json\n");
    return 2;
  }

  let config;
  try {
    config = parseHarnessConfig(readFileSync(harnessPath, "utf8"));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 2;
  }

  const slice = config.slices[sliceId];
  if (slice === undefined) {
    process.stderr.write(`unknown slice id: ${sliceId}\n`);
    return 2;
  }

  if (!existsSync(join(cwd, slice.manifest))) {
    process.stderr.write(`manifest not found: ${slice.manifest}\n`);
    return 2;
  }

  return runVerity(slice.manifest, cwd);
}
