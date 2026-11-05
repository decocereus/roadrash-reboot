import { hostname } from "node:os";

import {
  book,
  bookingMinutes,
  changeQueue,
  clockOf,
  describeQueue,
  endedLine,
  expectedEnd,
  holdsLine,
  laneName,
  release,
  turnOf,
} from "@racer/devtools/bench-queue";
import type {
  BookingRequest,
  Holder,
  QueueFile,
  TurnView,
} from "@racer/devtools/bench-queue";
import { UsageError } from "@racer/devtools/usage-error";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { CommandContext } from "./context.ts";

const DEFAULT_EVERY_S = 15;
const machine = hostname().split(".")[0] ?? hostname();

const decodeLane = Schema.decodeUnknownOption(laneName);
const decodeMinutes = Schema.decodeUnknownOption(bookingMinutes);

const bookingRequest = ([lane, minutes, ...purpose]: readonly string[]) => {
  const name = Option.getOrNull(decodeLane(lane));
  const length = Option.getOrNull(decodeMinutes(Number(minutes)));
  if (name === null || length === null || purpose.length === 0) {
    return Effect.fail(
      new UsageError({
        message:
          "rv book takes a lane, the minutes it needs and what it is for: rv book <lane> <minutes> <purpose>. A lane is lower case letters, digits and dashes, and minutes run from 1 to 240.",
      })
    );
  }
  const request: BookingRequest = {
    lane: name,
    minutes: length,
    owner: { kind: "lane" },
    purpose: purpose.join(" "),
  };
  return Effect.succeed(request);
};

const bookingId = (context: CommandContext) => {
  const [action, id] = context.rest;
  return id === undefined || id === ""
    ? Effect.fail(
        new UsageError({
          message: `rv book ${action} takes the booking's id: rv book ${action} <id>. rv book status lists them.`,
        })
      )
    : Effect.succeed(id);
};

const show = (context: CommandContext, queue: QueueFile, now: number) =>
  context.print(describeQueue(queue, now).join("\n"));

const exitWith = (code: number) =>
  Effect.sync(() => {
    process.exitCode = code;
  });

const newBooking = Effect.fn("rv.book.new")(function* newBooking(
  context: CommandContext
) {
  const request = yield* bookingRequest(context.rest);
  const { now, queue, result } = yield* changeQueue((current, at) =>
    book(current, request, at)
  );
  yield* context.print(`BOOKING=${result}`);
  yield* show(context, queue, now);
});

const status = Effect.fn("rv.book.status")(function* status(
  context: CommandContext
) {
  const { now, queue } = yield* changeQueue(
    (current) => [current, null] as const
  );
  yield* show(context, queue, now);
});

const releaseBooking = Effect.fn("rv.book.release")(function* releaseBooking(
  context: CommandContext
) {
  const id = yield* bookingId(context);
  const { now, queue, result } = yield* changeQueue(
    (current, at) =>
      [release(current, id, at, "released"), turnOf(current, id)] as const
  );
  if (result.kind === "ended") {
    yield* context.print(
      result.ended === null
        ? `${id}: no such booking.`
        : `Already over: ${endedLine(result.ended)}`
    );
    yield* exitWith(result.ended === null ? 1 : 0);
  }
  yield* show(context, queue, now);
});

interface Seen {
  readonly job: string | null;
  readonly key: string;
}

type WaitStep =
  | { readonly code: number; readonly kind: "done"; readonly line: string }
  | {
      readonly kind: "wait";
      readonly line: string | null;
      readonly seen: Seen;
    };

const waiting = (
  seen: Seen,
  key: string,
  line: string,
  job: string | null
): WaitStep => ({
  kind: "wait",
  line: key === seen.key ? null : line,
  seen: { job, key },
});

const yours = (id: string, held: Holder, job: string | null) =>
  job === null
    ? `${id}: your turn. ${machine} is yours until ${clockOf(expectedEnd(held))}; start within 10 min or the turn passes on.`
    : `${id}: ${job} ended; ${machine} stays yours until ${clockOf(expectedEnd(held))}, release it when done`;

const waitStep = (
  id: string,
  view: TurnView,
  untilEnd: boolean,
  seen: Seen
): WaitStep => {
  switch (view.kind) {
    case "ended": {
      return view.ended === null
        ? {
            code: 1,
            kind: "done",
            line: `${id}: no such booking. rv book status shows the queue.`,
          }
        : { code: untilEnd ? 0 : 1, kind: "done", line: endedLine(view.ended) };
    }
    case "waiting": {
      return waiting(
        seen,
        `${view.place} ${view.holder.booking.id} ${view.holder.use.kind}`,
        `${id}: number ${view.place} in line, ${holdsLine(view.holder)}`,
        seen.job
      );
    }
    case "held": {
      const { use } = view.holder;
      if (use.kind === "job") {
        return waiting(
          seen,
          `job ${use.pid}`,
          `${id}: running ${use.label} (pid ${use.pid})`,
          use.label
        );
      }
      return untilEnd
        ? waiting(seen, "idle", `${id}: ${holdsLine(view.holder)}`, seen.job)
        : { code: 0, kind: "done", line: yours(id, view.holder, seen.job) };
    }
    default: {
      return view satisfies never;
    }
  }
};

const secondsOf = (text: string | undefined) => {
  const seconds = text === undefined ? DEFAULT_EVERY_S : Number(text);
  return Number.isFinite(seconds) && seconds > 0
    ? Effect.succeed(seconds)
    : Effect.fail(
        new UsageError({
          message: `rv book wait --every takes seconds above 0, not ${text}.`,
        })
      );
};

const waitFor = Effect.fn("rv.book.wait")(function* waitFor(
  context: CommandContext
) {
  const id = yield* bookingId(context);
  const every = (yield* secondsOf(context.values.every)) * 1000;
  const untilEnd = context.values.end;
  const look = (seen: Seen) =>
    changeQueue((current) => [current, null] as const).pipe(
      Effect.map(({ queue }) => waitStep(id, turnOf(queue, id), untilEnd, seen))
    );
  let step = yield* look({ job: null, key: "" });
  while (step.kind === "wait") {
    if (step.line !== null) {
      yield* context.print(step.line);
    }
    yield* Effect.sleep(every);
    step = yield* look(step.seen);
  }
  yield* context.print(step.line);
  yield* exitWith(step.code);
});

const actions = new Map([
  ["release", releaseBooking],
  ["status", status],
  ["wait", waitFor],
]);

export const bookCommand = (context: CommandContext) =>
  (actions.get(context.rest[0] ?? "") ?? newBooking)(context);
