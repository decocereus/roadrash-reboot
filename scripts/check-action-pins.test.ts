import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const script = path.join(import.meta.dirname, "check-action-pins.ts");
const repositories: string[] = [];
const sha = "11d5960a326750d5838078e36cf38b85af677262";

const repository = (files: Readonly<Record<string, string>>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "rushline-pins-"));
  repositories.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
};

const checkPins = (dir: string) => {
  const result = spawnSync(process.execPath, [script], {
    cwd: dir,
    encoding: "utf-8",
  });
  return { status: result.status, stderr: result.stderr };
};

const failedLines = (stderr: string) =>
  stderr
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.slice(0, line.indexOf(": ")))
    .toSorted((left, right) => left.localeCompare(right));

describe("check:action-pins", () => {
  afterEach(() => {
    for (const dir of repositories.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("fails a tag, a branch, a short SHA, a pin without its version, a docker image, a quoted key, a flow mapping and a value on the next line", () => {
    const dir = repository({
      ".github/actions/setup/action.yml": [
        "runs:",
        "  steps:",
        "    - uses: pnpm/action-setup@v4",
      ].join("\n"),
      ".github/workflows/ci.yml": [
        "jobs:",
        "  static:",
        "    steps:",
        "      - uses: actions/checkout@main",
        "      - uses: actions/cache@0057852",
        `      - uses: actions/setup-node@${sha}`,
        "      - uses: docker://alpine:3.20",
        "      - name: upload",
        "        uses: 'actions/upload-artifact@v4' # v4.6.2",
        '      - "uses": actions/checkout@v4',
        "      - { name: cache, uses: actions/cache@v4 }",
        "      - uses:",
        "          actions/checkout@v4",
      ].join("\n"),
    });
    const result = checkPins(dir);
    expect(result.status).toBe(1);
    expect(failedLines(result.stderr)).toStrictEqual([
      ".github/actions/setup/action.yml:3",
      ".github/workflows/ci.yml:10",
      ".github/workflows/ci.yml:11",
      ".github/workflows/ci.yml:12",
      ".github/workflows/ci.yml:4",
      ".github/workflows/ci.yml:5",
      ".github/workflows/ci.yml:6",
      ".github/workflows/ci.yml:7",
      ".github/workflows/ci.yml:9",
    ]);
    expect(result.stderr).toContain(
      "pin `actions/checkout@main` to a full commit SHA"
    );
  });

  it("passes SHA pins with a version comment, quoted or not, and local actions", () => {
    const dir = repository({
      ".github/workflows/ci.yml": [
        "jobs:",
        "  static:",
        "    steps:",
        `      - uses: actions/checkout@${sha} # v4.4.0`,
        `      - uses: "actions/checkout@${sha}"  #v4.4.0`,
        "      - uses: ./.github/actions/setup",
        `      - { name: cache, uses: actions/cache@${sha} } # v4.3.0`,
        "      - run: echo 'uses: actions/checkout@v4'",
      ].join("\n"),
      "notes/ci.yml": "      - uses: actions/checkout@v4\n",
    });
    expect(checkPins(dir)).toStrictEqual({ status: 0, stderr: "" });
  });
});
