import path from "node:path";

import { clockMark, traceEvent } from "@racer/devtools/analysis";
import type { TraceEvent } from "@racer/devtools/analysis";
import { BrowserError } from "@racer/devtools/browser-error";
import { evaluate } from "@racer/devtools/cdp";
import type { Session } from "@racer/devtools/cdp";
import { byDeadline } from "@racer/devtools/deadline";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import type { Options } from "./measure-options.ts";

const POLL_MS = 40;

export const TRACE_CATEGORIES = ["devtools.timeline"];

export const FIRST_RUN_CATEGORIES = ["devtools.timeline", "toplevel"];

const TASK_EVENT = "ThreadControllerImpl::RunTask";

const SHORT_TASK_MICROS = 1000;

const COUNTDOWN_PROBE_MS = 300;

const collected = Schema.Struct({ value: Schema.Array(Schema.Unknown) });

const decodeEvent = Schema.decodeUnknownSync(traceEvent);

const screenshot = Schema.Struct({ data: Schema.String });

const currentTick = (page: Session) =>
  evaluate(
    page,
    "globalThis.__rushlineProfile ? globalThis.__rushlineProfile.info().tick : -1",
    Schema.Number
  );

export const waitForTick = Effect.fn("measure.waitForTick")(
  function* waitForTick(page: Session, tick: number, deadline: number) {
    let now = -1;
    const reached = Effect.gen(function* reached() {
      now = yield* currentTick(page);
      while (now < tick) {
        yield* Effect.sleep(POLL_MS);
        now = yield* currentTick(page);
      }
      return now;
    });
    return yield* reached.pipe(
      byDeadline(
        deadline,
        () =>
          new BrowserError({
            message: `The race never reached tick ${tick}; it is at ${now}.`,
            operation: "wait",
          })
      )
    );
  }
);

const heldCountdown = Effect.fnUntraced(function* heldCountdown(page: Session) {
  for (;;) {
    if ((yield* currentTick(page)) === 0) {
      yield* Effect.sleep(COUNTDOWN_PROBE_MS);
      if ((yield* currentTick(page)) === 0) {
        return;
      }
    }
    yield* Effect.sleep(POLL_MS);
  }
});

export const waitForCountdown = Effect.fn("measure.waitForCountdown")(
  function* waitForCountdown(page: Session, deadline: number) {
    yield* heldCountdown(page).pipe(
      byDeadline(
        deadline,
        () =>
          new BrowserError({
            message: "The race never held a countdown.",
            operation: "wait",
          })
      )
    );
  }
);

export const shoot = Effect.fn("measure.shoot")(function* shoot(
  page: Session,
  options: Options,
  run: number,
  deadline: number
) {
  const fs = yield* FileSystem.FileSystem;
  const files: string[] = [];
  for (const tick of options.shots) {
    const reached = yield* waitForTick(page, tick, deadline);
    const { data } = yield* page.call(
      "Page.captureScreenshot",
      { format: "png" },
      screenshot
    );
    const file = path.join(
      options.out,
      `${options.label}-run${run}-tick${reached}.png`
    );
    yield* fs.writeFile(file, Buffer.from(data, "base64"));
    files.push(file);
  }
  return files;
});

export interface Collected {
  readonly raw: unknown[];
  readonly events: TraceEvent[];
}

const worthKeeping = (event: TraceEvent): boolean =>
  event.name !== TASK_EVENT || (event.dur ?? 0) >= SHORT_TASK_MICROS;

export const startTrace = Effect.fn("measure.startTrace")(function* startTrace(
  page: Session,
  into: Collected,
  categories: readonly string[]
) {
  yield* page.on("Tracing.dataCollected", collected, ({ value }) => {
    for (const each of value) {
      const event = decodeEvent(each);
      if (worthKeeping(event)) {
        into.raw.push(each);
        into.events.push(event);
      }
    }
  });
  yield* page.send("Tracing.start", {
    traceConfig: { includedCategories: [...categories] },
    transferMode: "ReportEvents",
  });
});

export const stopTrace = Effect.fn("measure.stopTrace")(function* stopTrace(
  page: Session
) {
  const complete = yield* page.once("Tracing.tracingComplete", Schema.Unknown);
  yield* page.send("Tracing.end");
  yield* complete;
});

export const pageClock = (page: Session) =>
  evaluate(
    page,
    `(console.timeStamp(${JSON.stringify(clockMark)}), performance.now())`,
    Schema.Number
  );
