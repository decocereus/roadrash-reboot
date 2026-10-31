import { once } from "node:events";
import { Worker } from "node:worker_threads";

import { describe, expect, it } from "vitest";

import { openCase, replayCases, ride } from "./pilot-replay.ts";
import { checkpointAt } from "./replay-bundle.ts";

const COLD_CASE = "stress/seed8";
const COLD_AT = 2880;
const COLD_TICKS = 600;
const HASH_LETTERS = 32;
const COLD_TIMEOUT_MS = 120_000;

const framesIn = (room: SharedArrayBuffer): readonly string[] => {
  const written = new TextDecoder().decode(new Uint8Array(room));
  const frames: string[] = [];
  for (let at = 0; at < written.length; at += HASH_LETTERS) {
    frames.push(written.slice(at, at + HASH_LETTERS));
  }
  return frames;
};

const inFreshWorker = async (
  checkpoint: string
): Promise<readonly string[]> => {
  const room = new SharedArrayBuffer(HASH_LETTERS * COLD_TICKS);
  const worker = new Worker(
    new URL("cold-restore-worker.ts", import.meta.url),
    {
      workerData: {
        checkpoint,
        frames: room,
        id: COLD_CASE,
        ticks: COLD_TICKS,
      },
    }
  );
  const exit: unknown[] = await once(worker, "exit");
  const [code] = exit;
  if (code !== 0) {
    throw new Error(`The cold worker exited with code ${String(code)}.`);
  }
  return framesIn(room);
};

describe("a checkpoint restored with nothing warmed up", () => {
  it(
    "carries the race on tick for tick in a worker that has run none of it",
    async () => {
      const replay = replayCases.find(({ id }) => id === COLD_CASE);
      if (!replay) {
        throw new Error(`The replay cases have no ${COLD_CASE} race.`);
      }
      const warm = ride(openCase(replay), COLD_AT + COLD_TICKS).frames.slice(
        COLD_AT
      );
      expect(warm).toHaveLength(COLD_TICKS);
      const cold = await inFreshWorker(checkpointAt(COLD_CASE, COLD_AT));
      expect(cold).toStrictEqual(warm);
    },
    COLD_TIMEOUT_MS
  );
});
