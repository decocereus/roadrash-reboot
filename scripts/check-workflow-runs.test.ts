import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const script = path.join(import.meta.dirname, "check-workflow-runs.ts");
const repositories: string[] = [];

const repository = (files: Readonly<Record<string, string>>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "rushline-workflow-runs-"));
  repositories.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
};

const checkRuns = (dir: string) => {
  const result = spawnSync(process.execPath, [script], {
    cwd: dir,
    encoding: "utf-8",
  });
  return { status: result.status, stderr: result.stderr };
};

const quality = ["name: Quality", "on:", "  push:"].join("\n");

const following = (...trigger: readonly string[]) =>
  [
    "name: Deploy",
    "on:",
    "  workflow_run:",
    ...trigger,
    "    types: [completed]",
    "  workflow_dispatch:",
  ].join("\n");

describe("check:workflow-runs", () => {
  afterEach(() => {
    for (const dir of repositories.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("passes a workflow_run that names a workflow, inline or listed, quoted or not", () => {
    const dir = repository({
      ".github/workflows/deploy.yml": following("    workflows: [Quality]"),
      ".github/workflows/notify.yml": following(
        "    workflows:",
        '      - "Quality" # the CI run',
        "      - Deploy"
      ),
      ".github/workflows/quality.yml": quality,
    });
    expect(checkRuns(dir)).toStrictEqual({ status: 0, stderr: "" });
  });

  it("fails a renamed workflow, a misspelt one and a trigger that names none, at their lines", () => {
    const dir = repository({
      ".github/workflows/deploy.yml": following("    workflows: [Quality, CI]"),
      ".github/workflows/notify.yml": following(
        "    workflows:",
        "      - Qualty"
      ),
      ".github/workflows/quality.yml": quality,
      ".github/workflows/watch.yml": following(),
    });
    const result = checkRuns(dir);
    expect(result.status).toBe(1);
    expect(
      result.stderr
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => line.slice(0, line.indexOf(": ")))
    ).toStrictEqual([
      ".github/workflows/deploy.yml:4",
      ".github/workflows/notify.yml:5",
      ".github/workflows/watch.yml:3",
    ]);
    expect(result.stderr).toContain('waits for "CI"');
  });
});
