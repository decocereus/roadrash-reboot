import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const fixtures = path.join(import.meta.dirname, "fixtures");

const runSession = (args: readonly string[]) => {
  const result = spawnSync(
    process.execPath,
    ["tools/perf/session.ts", ...args],
    { cwd: root, encoding: "utf-8" }
  );
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

describe("perf session", () => {
  it.for([
    {
      args: ["--dir", "tools/perf/test/fixtures/sessions", "--json"],
      expected: "session-json.txt",
    },
    {
      args: ["--dir", "tools/perf/test/fixtures/sessions"],
      expected: "session-text.txt",
    },
    {
      args: ["--dir", "tools/perf/test/fixtures/no-such-dir"],
      expected: "session-empty.txt",
    },
  ])("prints $expected for the fixture sessions", ({ args, expected }) => {
    expect(runSession(args)).toStrictEqual({
      status: 0,
      stderr: "",
      stdout: readFileSync(path.join(fixtures, expected), "utf-8"),
    });
  });
});
