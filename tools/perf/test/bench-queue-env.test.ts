import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

const vitest = path.join(
  path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
  "vitest.mjs"
);

describe("the bench queue tests run from inside a booking's job", () => {
  it("pass as they do outside one, because every test builds its own bench turn", () => {
    const run = spawnSync(
      process.execPath,
      [
        vitest,
        "run",
        "--project",
        "node",
        "tools/perf/test/bench-queue.test.ts",
        "tools/verify/test/cli.test.ts",
      ],
      {
        encoding: "utf-8",
        env: {
          ...process.env,
          RUSHLINE_BENCH_PID: String(process.pid),
          RUSHLINE_BOOKING: "lane-1",
        },
      }
    );
    expect({
      output: run.stdout + run.stderr,
      status: run.status,
    }).toMatchObject({ status: 0 });
  }, 120_000);
});
