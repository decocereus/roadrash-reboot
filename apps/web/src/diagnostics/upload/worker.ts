import { FIRST_RETRY_MS, LONGEST_RETRY_MS } from "@racer/telemetry/limits";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

import type { UploadQueue } from "../uploader.ts";
import { deliver } from "./delivery.ts";

interface Cycle {
  readonly again: boolean;
  readonly delayMs: number;
}

const idle: Cycle = { again: false, delayMs: 0 };

const retryDelayMs = (attempts: number): number =>
  Math.min(LONGEST_RETRY_MS, FIRST_RETRY_MS * 2 ** attempts);

const cycle = (
  queue: UploadQueue,
  send: typeof globalThis.fetch
): Effect.Effect<Cycle> =>
  Effect.suspend(() => {
    const entry = queue.next();
    if (entry === undefined) {
      return Effect.succeed(idle);
    }
    return deliver(entry, send).pipe(
      Effect.map((delivery): Cycle => ({
        again: true,
        delayMs: queue.settle(entry, delivery)
          ? retryDelayMs(entry.attempts)
          : 0,
      }))
    );
  });

const afterEachCycle = Schedule.forever.pipe(
  Schedule.setInputType<Cycle>(),
  Schedule.modifyDelay(({ input }) =>
    Effect.succeed(Duration.millis(input.delayMs))
  )
);

export const drainQueue = Effect.fn("telemetry.upload.drain")(
  function* drainQueue(queue: UploadQueue, send: typeof globalThis.fetch) {
    yield* cycle(queue, send).pipe(
      Effect.repeat({ schedule: afterEachCycle, while: (step) => step.again })
    );
  }
);
