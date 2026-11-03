import { once } from "node:events";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { CleanupOutcomes } from "@racer/devtools/cleanup";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import { holdBench } from "../src/bench-lock.ts";

const decodeOrder = Schema.decodeUnknownSync(
  Schema.Struct({ dir: Schema.NullOr(Schema.String) })
);

const nextOrder = Effect.promise(async () => {
  const received: unknown[] = await once(process, "message");
  return decodeOrder(received[0]);
});

const reportThenAwaitRelease = (entered: boolean) =>
  Effect.suspend(() => {
    process.send?.({ entered });
    return nextOrder;
  });

const contend = Effect.fnUntraced(function* contend(dir: string) {
  const outcomes = yield* Ref.make<readonly Cause.Cause<unknown>[]>([]);
  const exit = yield* Effect.exit(
    Effect.scoped(
      holdBench(`worker ${process.pid}`, dir).pipe(
        Effect.andThen(reportThenAwaitRelease(true))
      )
    ).pipe(Effect.provideService(CleanupOutcomes, outcomes))
  );
  if (Exit.isFailure(exit)) {
    yield* reportThenAwaitRelease(false);
  }
  process.send?.({ released: true });
});

const serve = Effect.gen(function* serve() {
  process.send?.({ ready: true });
  let { dir } = yield* nextOrder;
  while (dir !== null) {
    yield* contend(dir);
    ({ dir } = yield* nextOrder);
  }
});

await Effect.runPromise(serve.pipe(Effect.provide(NodeFileSystem.layer)));
