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

const locationsIn = (stderr: string) =>
  stderr
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.slice(0, line.indexOf(": ")));

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

  it("passes names that hold a comma or a #, in every spelling of the trigger", () => {
    const dir = repository({
      ".github/workflows/build.yml": [
        'name: "Build, test #2"',
        "on: push",
      ].join("\n"),
      ".github/workflows/flow.yml": [
        "name: Flow",
        'on: { "workflow_run": { workflows: ["Build, test #2"] } }',
      ].join("\n"),
      ".github/workflows/listed.yml": following(
        "    workflows:",
        "      - 'Build, test #2' # the build",
        "      - Flow"
      ),
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
    expect(locationsIn(result.stderr)).toStrictEqual([
      ".github/workflows/deploy.yml:4:26",
      ".github/workflows/notify.yml:5:9",
      ".github/workflows/watch.yml:3:3",
    ]);
    expect(result.stderr).toContain('waits for "CI"');
  });

  it("fails a missing workflow named by a flow-style trigger, by quoted keys, or a trigger listed with no workflows", () => {
    const dir = repository({
      ".github/workflows/flow.yml": [
        "name: Flow",
        "on: { workflow_run: { workflows: [Missing], types: [completed] } }",
      ].join("\n"),
      ".github/workflows/listed.yml": [
        "name: Listed",
        "on: [push, workflow_run]",
      ].join("\n"),
      ".github/workflows/quoted.yml": [
        "name: Quoted",
        "on:",
        '  "workflow_run":',
        "    'workflows': [Missing]",
      ].join("\n"),
    });
    const result = checkRuns(dir);
    expect(result.status).toBe(1);
    expect(locationsIn(result.stderr)).toStrictEqual([
      ".github/workflows/flow.yml:2:35",
      ".github/workflows/listed.yml:2:12",
      ".github/workflows/quoted.yml:4:19",
    ]);
  });

  it("fails a workflow file that is not valid YAML, where the parser stopped", () => {
    const dir = repository({
      ".github/workflows/broken.yml": ["name: [Broken", "on: push"].join("\n"),
      ".github/workflows/quality.yml": quality,
    });
    const result = checkRuns(dir);
    expect(result.status).toBe(1);
    expect(locationsIn(result.stderr)).toStrictEqual([
      ".github/workflows/broken.yml:2:1",
    ]);
  });
});
