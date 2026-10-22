import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it } from "vitest";

import { budgetsFile } from "../src/budgets.ts";
import type { Budgets } from "../src/budgets.ts";

const GATE = path.join(import.meta.dirname, "../gate.ts");
const BUDGETS = path.join(import.meta.dirname, "../budgets.json");

const committed: Budgets = Schema.decodeUnknownSync(
  Schema.fromJsonString(budgetsFile)
)(readFileSync(BUDGETS, "utf-8"));

const made: string[] = [];

const check = (budgets: Budgets | null) => {
  const args = [GATE, "--check"];
  if (budgets) {
    const dir = mkdtempSync(path.join(tmpdir(), "rushline-perf-check-"));
    made.push(dir);
    const file = path.join(dir, "budgets.json");
    writeFileSync(file, JSON.stringify(budgets));
    args.push("--budgets", file);
  }
  return spawnSync(process.execPath, args, { encoding: "utf-8" });
};

describe("check:perf", () => {
  afterEach(() => {
    for (const dir of made.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("accepts the committed budgets and baseline", () => {
    const ran = check(null);
    expect(ran.stdout).toContain("ok   perf baseline");
    expect(ran.status).toBe(0);
  });

  it("rejects a budgets file that lost a limit", () => {
    const [dropped, ...kept] = committed.limits;
    const ran = check({ ...committed, limits: kept });
    expect(ran.stdout).toContain(
      `missing limit ${dropped?.metric}|${dropped?.scenario ?? "-"}|${dropped?.environment}`
    );
    expect(ran.status).toBe(2);
  });

  it("rejects a limit whose baseline no longer matches the recorded run", () => {
    const ran = check({
      ...committed,
      limits: committed.limits.map((limit, index) =>
        index === 0 ? { ...limit, baseline: limit.baseline + 1 } : limit
      ),
    });
    expect(ran.stdout).toContain("does not match its baseline");
    expect(ran.status).toBe(2);
  });
});
