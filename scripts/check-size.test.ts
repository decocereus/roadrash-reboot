import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const script = path.join(import.meta.dirname, "check-size.ts");
const repositories: string[] = [];

const repository = (files: Readonly<Record<string, string>>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "rushline-size-"));
  repositories.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
};

const track = (dir: string, files: readonly string[]) => {
  execFileSync("git", ["add", "--", ...files], { cwd: dir });
};

const checkSize = (dir: string) => {
  const result = spawnSync(process.execPath, [script], {
    cwd: dir,
    encoding: "utf-8",
  });
  return { status: result.status, stderr: result.stderr };
};

const over = "x".repeat(20_001);
const atLimit = "x".repeat(20_000);

describe("check:size", () => {
  afterEach(() => {
    for (const dir of repositories.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("fails every tracked or untracked source file over 20,000 characters", () => {
    const dir = repository({
      ".gitignore": "out/\n",
      "app/at-limit.ts": atLimit,
      "app/notes.md": over,
      "app/route.tsx": over,
      "app/schema.sql": over,
      "app/styles.css": over,
      "app/types.d.ts": over,
      "app/untracked.ts": over,
      "out/bundle.ts": over,
    });
    track(dir, [
      ".gitignore",
      "app/at-limit.ts",
      "app/notes.md",
      "app/route.tsx",
      "app/schema.sql",
      "app/styles.css",
      "app/types.d.ts",
    ]);
    const result = checkSize(dir);
    expect(result.status).toBe(1);
    expect(
      result.stderr
        .trim()
        .split("\n")
        .map((line) => line.slice(0, line.indexOf(" ")))
        .toSorted((left, right) => left.localeCompare(right))
    ).toStrictEqual([
      "app/route.tsx",
      "app/schema.sql",
      "app/styles.css",
      "app/types.d.ts",
      "app/untracked.ts",
    ]);
    expect(result.stderr).toContain(
      "app/route.tsx has 20001 characters. A source file may have at most 20000; split it."
    );
  });

  it("passes 20,000 characters, ignored output and a tracked file deleted from disk", () => {
    const dir = repository({
      ".gitignore": "out/\n",
      "app/accented.ts": "é".repeat(20_000),
      "app/at-limit.css": atLimit,
      "app/deleted.ts": atLimit,
      "out/bundle.tsx": over,
    });
    track(dir, [".gitignore", "app/at-limit.css", "app/deleted.ts"]);
    rmSync(path.join(dir, "app/deleted.ts"));
    expect(checkSize(dir)).toStrictEqual({ status: 0, stderr: "" });
  });
});
