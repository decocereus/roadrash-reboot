import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { beforeAll, describe, expect, it } from "vitest";

const CONTENDERS = 4;
const TRIALS = 40;
const WORKER = path.join(import.meta.dirname, "bench-queue-worker.ts");
const DEAD_PID = 2 ** 30;
const DEAD_CLAIM = JSON.stringify({ label: "crashed bench", pid: DEAD_PID });
const DEAD_HOLDER = JSON.stringify({
  ended: [],
  holder: {
    booking: {
      bookedAt: 0,
      id: "bench-1",
      lane: "bench",
      minutes: 120,
      owner: { kind: "process", pid: DEAD_PID },
      purpose: "crashed bench",
    },
    since: 0,
    use: { kind: "job", label: "crashed bench", pid: DEAD_PID },
  },
  next: 2,
  waiting: [],
});

const decodeReport = Schema.decodeUnknownSync(
  Schema.Struct({ entered: Schema.Boolean })
);

const decodeHolder = Schema.decodeUnknownSync(
  Schema.Struct({ holder: Schema.Null, waiting: Schema.Tuple([]) })
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
  return reports.filter((report) => decodeReport(report).entered).length;
};

describe("contending for the bench queue with real processes", () => {
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
    {
      name: "a holder whose process died",
      seed: { "bench-queue.json": DEAD_HOLDER },
    },
    {
      name: "a queue nobody can read",
      seed: { "bench-queue.json": "not json" },
    },
    {
      name: "a dead lock beside a clearer that died",
      seed: {
        "bench-queue.lock": DEAD_CLAIM,
        "bench-queue.lock.clearing": DEAD_CLAIM,
      },
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
      const queue = decodeHolder(
        JSON.parse(readFileSync(path.join(dir, "bench-queue.json"), "utf-8"))
      );
      rmSync(dir, { force: true, recursive: true });
      expect(holders).toStrictEqual(holders.map(() => 1));
      expect(left).toStrictEqual(["bench-queue.json"]);
      expect(queue).toMatchObject({ holder: null, waiting: [] });
    }
  );

  it("stops every contender with exit code 0", async () => {
    const exits = Promise.all(children.map(exitCodeOf));
    orderEach(children, null);
    await expect(exits).resolves.toStrictEqual(children.map(() => 0));
  });
});
