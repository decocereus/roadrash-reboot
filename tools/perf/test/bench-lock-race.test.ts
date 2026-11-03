import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { beforeAll, describe, expect, it } from "vitest";

const CONTENDERS = 4;
const TRIALS = 40;
const WORKER = path.join(import.meta.dirname, "bench-lock-worker.ts");
const DEAD_CLAIM = JSON.stringify({ label: "crashed bench", pid: 2 ** 30 });

const decodeReport = Schema.decodeUnknownSync(
  Schema.Struct({ entered: Schema.Boolean })
);

const nextMessage = async (child: ChildProcess) => {
  const received: unknown[] = await once(child, "message");
  return received[0];
};

const exitCodeOf = async (child: ChildProcess) => {
  const exit: unknown[] = await once(child, "exit");
  return exit[0];
};

const orderEach = (
  children: readonly ChildProcess[],
  dir: string | null
): void => {
  for (const child of children) {
    child.send({ dir });
  }
};

const holdersOfOneTrial = async (
  children: readonly ChildProcess[],
  dir: string
) => {
  const reporting = Promise.all(children.map(nextMessage));
  orderEach(children, dir);
  const reports = await reporting;
  const released = Promise.all(children.map(nextMessage));
  orderEach(children, null);
  await released;
  return reports.map(decodeReport).filter((report) => report.entered).length;
};

describe("recovering a dead bench claim with real processes", () => {
  const children: ChildProcess[] = [];

  beforeAll(async () => {
    for (let index = 0; index < CONTENDERS; index += 1) {
      children.push(
        fork(WORKER, {
          execArgv: [],
          stdio: ["ignore", "ignore", "inherit", "ipc"],
        })
      );
    }
    await Promise.all(children.map(nextMessage));
  }, 60_000);

  it.for([
    { name: "a claim whose pid died", seed: { "bench.lock": DEAD_CLAIM } },
    { name: "a claim nobody can read", seed: { "bench.lock": "not json" } },
    {
      name: "a dead claim beside a clearer that died",
      seed: { "bench.lock": DEAD_CLAIM, "bench.lock.clearing": DEAD_CLAIM },
    },
  ])(
    "lets one process win every trial over $name",
    { timeout: 120_000 },
    async ({ seed }) => {
      const dir = mkdtempSync(path.join(tmpdir(), "rushline-bench-race-test-"));
      const trial = Effect.promise(async () => {
        for (const [name, text] of Object.entries(seed)) {
          writeFileSync(path.join(dir, name), text);
        }
        return await holdersOfOneTrial(children, dir);
      });
      const holders = await Effect.runPromise(
        Effect.all(Array.from({ length: TRIALS }, () => trial))
      );
      const left = readdirSync(dir);
      rmSync(dir, { force: true, recursive: true });
      expect(holders).toStrictEqual(holders.map(() => 1));
      expect(left).toStrictEqual([]);
    }
  );

  it("stops every contender with exit code 0", async () => {
    const exits = Promise.all(children.map(exitCodeOf));
    orderEach(children, null);
    await expect(exits).resolves.toStrictEqual(children.map(() => 0));
  });
});
