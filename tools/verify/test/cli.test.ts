import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const fixtures = path.join(import.meta.dirname, "fixtures");
const emptyTemp = mkdtempSync(path.join(tmpdir(), "rushline-cli-test-"));

const runCli = (args: readonly string[]) => {
  const result = spawnSync(
    process.execPath,
    ["tools/verify/rushline.ts", ...args],
    {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, TMPDIR: emptyTemp },
    }
  );
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

describe("rv command line", () => {
  afterAll(() => {
    rmSync(emptyTemp, { force: true, recursive: true });
  });

  it.for([
    { args: ["help"], expected: "help.txt" },
    { args: [], expected: "help.txt" },
    { args: ["bogus"], expected: "help.txt" },
    { args: ["list"], expected: "list-empty.txt" },
  ])("prints $expected for rv $args", ({ args, expected }) => {
    expect(runCli(args)).toStrictEqual({
      status: 0,
      stderr: "",
      stdout: readFileSync(path.join(fixtures, expected), "utf-8"),
    });
  });
});
