import type { Session } from "@racer/devtools/cdp";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";

import { waitFor } from "../src/page.ts";
import { VerificationError } from "../src/verification-error.ts";

const HANG_GUARD_MS = 1000;

const suppliedPage = (answer: (index: number) => Effect.Effect<string>) => {
  const started: number[] = [];
  let answered = 0;
  let interrupted = 0;
  const page: Session = {
    call: (_method, _params, schema) =>
      Effect.gen(function* answerCall() {
        started.push(yield* Clock.currentTimeMillis);
        const value = yield* answer(started.length - 1).pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted += 1;
            })
          )
        );
        answered += 1;
        return yield* Schema.decodeUnknownEffect(schema)({
          result: { value },
        }).pipe(Effect.orDie);
      }),
    closed: Effect.never,
    on: () => Effect.void,
    once: () => Effect.succeed(Effect.never),
    send: () => Effect.void,
  };
  return {
    interrupted: () => interrupted,
    page,
    started,
    unanswered: () => started.length - answered,
  };
};

const settle = async <A, E>(operation: Effect.Effect<A, E>, advance: number) =>
  await Effect.runPromise(
    Effect.gen(function* settleOnTestClock() {
      let at = Number.NaN;
      const fiber = yield* Effect.forkChild(
        operation.pipe(
          Effect.onExit(() =>
            Effect.gen(function* stampExit() {
              at = yield* Clock.currentTimeMillis;
            })
          )
        )
      );
      yield* TestClock.adjust(advance);
      const outcome = yield* TestClock.withLive(
        Effect.timeoutOption(Fiber.join(fiber), HANG_GUARD_MS)
      );
      return { at, outcome };
    }).pipe(Effect.provide(TestClock.layer()))
  );

describe("rv waitFor", () => {
  it("returns the first truthy answer on the 100 ms poll", async () => {
    const supplied = suppliedPage((index) =>
      Effect.succeed(index < 2 ? "" : "true")
    );
    const { at, outcome } = await settle(
      waitFor(supplied.page, "ready", 1000),
      1000
    );
    expect(outcome).toStrictEqual(Option.some("true"));
    expect(supplied.started).toStrictEqual([0, 100, 200]);
    expect(at).toBe(200);
  });

  it("fails at the deadline while the answer stays false", async () => {
    const supplied = suppliedPage(() => Effect.succeed(""));
    const { at, outcome } = await settle(
      Effect.flip(waitFor(supplied.page, "ready", 1000)),
      2000
    );
    const error = Option.getOrThrow(outcome);
    expect(error).toBeInstanceOf(VerificationError);
    expect(error).toMatchObject({
      message: "Timed out waiting for ready",
      operation: "wait",
    });
    expect(at).toBe(1000);
  });

  it.each([
    { advance: 0, deadline: -1, name: "already passed", stopsAt: 0 },
    { advance: 2000, deadline: 50, name: "50 ms away", stopsAt: 50 },
  ])(
    "interrupts a call the page never answers when the deadline is $name",
    async ({ advance, deadline, stopsAt }) => {
      const supplied = suppliedPage(() => Effect.never);
      const { at, outcome } = await settle(
        Effect.flip(waitFor(supplied.page, "ready", deadline)),
        advance
      );
      const error = Option.getOrThrow(outcome);
      expect(error).toBeInstanceOf(VerificationError);
      expect(error).toMatchObject({
        message: "Timed out waiting for ready",
        operation: "wait",
      });
      expect(at).toBe(stopsAt);
      expect(supplied.interrupted()).toBe(supplied.unanswered());
    }
  );
});
