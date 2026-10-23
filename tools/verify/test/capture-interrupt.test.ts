import type { Session } from "@racer/devtools/cdp";
import type { CommandParams } from "@racer/devtools/cdp-protocol";
import { CleanupOutcomes } from "@racer/devtools/cleanup";
import type * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Latch from "effect/Latch";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import { describe, expect, it } from "vitest";

import { screencast } from "../src/capture.ts";
import { trace } from "../src/profile.ts";

type Emit = (method: string, params: CommandParams) => Effect.Effect<void>;

type Reply = (method: string, emit: Emit) => Effect.Effect<void>;

const suppliedPage = (reply: Reply) => {
  const sent: string[] = [];
  const listeners = new Map<
    string,
    (params: CommandParams) => Effect.Effect<void>
  >();
  const emit: Emit = (method, params) =>
    listeners.get(method)?.(params) ?? Effect.void;
  const subscribe = <T>(
    method: string,
    schema: Schema.ConstraintDecoder<T>,
    handle: (value: T) => Effect.Effect<void>
  ) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        listeners.set(method, (params) =>
          Schema.decodeUnknownEffect(schema)(params).pipe(
            Effect.flatMap(handle),
            Effect.orDie
          )
        );
      }),
      () =>
        Effect.sync(() => {
          listeners.delete(method);
        })
    );
  const page: Session = {
    call: (method) => Effect.die(`${method} is not part of a capture`),
    closed: Effect.never,
    on: (method, schema, listener) =>
      subscribe(method, schema, (value) =>
        Effect.sync(() => {
          listener(value);
        })
      ),
    once: <T>(method: string, schema: Schema.ConstraintDecoder<T>) =>
      Effect.gen(function* subscribeOnce() {
        const arrived = yield* Deferred.make<T>();
        yield* subscribe(method, schema, (value) =>
          Effect.asVoid(Deferred.succeed(arrived, value))
        );
        return Deferred.await(arrived);
      }),
    send: (method) =>
      Effect.sync(() => {
        sent.push(method);
      }).pipe(Effect.andThen(reply(method, emit))),
  };
  return { page, sent };
};

const frame = (sessionId: number) =>
  ({
    data: "AAAA",
    metadata: { timestamp: sessionId },
    sessionId,
  }) satisfies CommandParams;

const interruptAfterStart = Effect.fnUntraced(function* interruptAfterStart<
  A,
  E,
>(
  capture: Effect.Effect<
    A,
    E,
    CleanupOutcomes | FileSystem.FileSystem | Scope.Scope
  >,
  started: Latch.Latch
) {
  const outcomes = yield* Ref.make<readonly Cause.Cause<unknown>[]>([]);
  const fiber = yield* Effect.forkChild(
    Effect.scoped(capture).pipe(
      Effect.provideService(CleanupOutcomes, outcomes)
    )
  );
  yield* started.await;
  yield* Fiber.interrupt(fiber);
  return yield* Ref.get(outcomes);
});

describe("captures interrupted right after they start", () => {
  it("ends the trace", async () => {
    const { cleanup, sent } = await Effect.runPromise(
      Effect.gen(function* traceThenInterrupt() {
        const started = yield* Latch.make();
        const supplied = suppliedPage((method, emit) => {
          if (method === "Tracing.start") {
            return Effect.asVoid(started.open);
          }
          if (method === "Tracing.end") {
            return emit("Tracing.dataCollected", { value: [] }).pipe(
              Effect.andThen(emit("Tracing.tracingComplete", {}))
            );
          }
          return Effect.void;
        });
        const failed = yield* interruptAfterStart(
          trace(supplied.page, "/tmp/rushline-trace-test.json", 5),
          started
        );
        return { cleanup: failed, sent: supplied.sent };
      }).pipe(Effect.provide(FileSystem.layerNoop({})))
    );
    expect(sent).toStrictEqual(["Tracing.start", "Tracing.end"]);
    expect(cleanup).toStrictEqual([]);
  });

  it("stops the screencast and writes the frames it accepted", async () => {
    const dir = "/tmp/rushline-screencast-test";
    const written: string[] = [];
    const { cleanup, sent } = await Effect.runPromise(
      Effect.gen(function* screencastThenInterrupt() {
        const started = yield* Latch.make();
        const stopped = yield* Latch.make();
        const supplied = suppliedPage((method, emit) => {
          if (method === "Page.startScreencast") {
            return emit("Page.screencastFrame", frame(1)).pipe(
              Effect.andThen(emit("Page.screencastFrame", frame(2))),
              Effect.andThen(started.open)
            );
          }
          if (method === "Page.stopScreencast") {
            return Effect.asVoid(stopped.open);
          }
          return Effect.void;
        });
        const failed = yield* interruptAfterStart(
          screencast(supplied.page, dir, 5, 1),
          started
        ).pipe(
          Effect.provide(
            FileSystem.layerNoop({
              makeDirectory: () => Effect.void,
              writeFile: (file) =>
                stopped.await.pipe(
                  Effect.andThen(
                    Effect.sync(() => {
                      written.push(file);
                    })
                  )
                ),
            })
          )
        );
        return { cleanup: failed, sent: supplied.sent };
      })
    );
    expect(sent).toContain("Page.stopScreencast");
    expect(written).toStrictEqual([
      `${dir}/frame-0000.jpg`,
      `${dir}/frame-0001.jpg`,
    ]);
    expect(cleanup).toStrictEqual([]);
  });
});
