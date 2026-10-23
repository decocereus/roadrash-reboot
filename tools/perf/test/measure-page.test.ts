import { BrowserError } from "@racer/devtools/browser-error";
import type { Session } from "@racer/devtools/cdp";
import type { CdpError } from "@racer/devtools/cdp-error";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";

import { waitForCountdown, waitForTick } from "../src/measure-page.ts";

const HANG_GUARD_MS = 1000;

const suppliedPage = (answer: (index: number) => Effect.Effect<number>) => {
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

const ticks =
  (...answers: readonly number[]) =>
  (index: number) => {
    const tick = answers[index];
    return tick === undefined ? Effect.never : Effect.succeed(tick);
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

const expectWaitFailure = (
  outcome: Option.Option<BrowserError | CdpError>,
  message: string
) => {
  const error = Option.getOrThrow(outcome);
  expect(error).toBeInstanceOf(BrowserError);
  expect(error).toMatchObject({ message, operation: "wait" });
};

describe("measure waitForTick", () => {
  it("returns the first tick at or past the target on the 40 ms poll", async () => {
    const supplied = suppliedPage(ticks(-1, 3, 10));
    const { at, outcome } = await settle(
      waitForTick(supplied.page, 10, 1000),
      1000
    );
    expect(outcome).toStrictEqual(Option.some(10));
    expect(supplied.started).toStrictEqual([0, 40, 80]);
    expect(at).toBe(80);
  });

  it("fails at the deadline with the last tick it read", async () => {
    const supplied = suppliedPage(() => Effect.succeed(5));
    const { at, outcome } = await settle(
      Effect.flip(waitForTick(supplied.page, 10, 1000)),
      2000
    );
    expectWaitFailure(outcome, "The race never reached tick 10; it is at 5.");
    expect(at).toBe(1000);
  });

  it.each([
    { advance: 0, deadline: -1, name: "already passed", stopsAt: 0 },
    { advance: 2000, deadline: 100, name: "100 ms away", stopsAt: 100 },
  ])(
    "interrupts a call the page never answers when the deadline is $name",
    async ({ advance, deadline, stopsAt }) => {
      const supplied = suppliedPage(() => Effect.never);
      const { at, outcome } = await settle(
        Effect.flip(waitForTick(supplied.page, 10, deadline)),
        advance
      );
      expectWaitFailure(
        outcome,
        "The race never reached tick 10; it is at -1."
      );
      expect(at).toBe(stopsAt);
      expect(supplied.interrupted()).toBe(supplied.unanswered());
    }
  );
});

describe("measure waitForCountdown", () => {
  it("returns once tick 0 holds across the 300 ms probe", async () => {
    const supplied = suppliedPage(ticks(-1, 0, 0));
    const { at, outcome } = await settle(
      waitForCountdown(supplied.page, 1000),
      1000
    );
    expect(Option.isSome(outcome)).toBeTruthy();
    expect(supplied.started).toStrictEqual([0, 40, 340]);
    expect(at).toBe(340);
  });

  it("fails at the deadline when the race runs without holding", async () => {
    const supplied = suppliedPage(() => Effect.succeed(5));
    const { at, outcome } = await settle(
      Effect.flip(waitForCountdown(supplied.page, 1000)),
      2000
    );
    expectWaitFailure(outcome, "The race never held a countdown.");
    expect(at).toBe(1000);
  });

  it.each([
    {
      advance: 0,
      answers: [],
      deadline: -1,
      name: "the first read, deadline already passed",
      stopsAt: 0,
    },
    {
      advance: 2000,
      answers: [0],
      deadline: 1000,
      name: "the probe read, deadline 1000 ms away",
      stopsAt: 1000,
    },
  ])(
    "interrupts $name when the page never answers",
    async ({ advance, answers, deadline, stopsAt }) => {
      const supplied = suppliedPage(ticks(...answers));
      const { at, outcome } = await settle(
        Effect.flip(waitForCountdown(supplied.page, deadline)),
        advance
      );
      expectWaitFailure(outcome, "The race never held a countdown.");
      expect(at).toBe(stopsAt);
      expect(supplied.interrupted()).toBe(supplied.unanswered());
    }
  );
});
