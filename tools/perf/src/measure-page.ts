import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { clockMark, traceEvent } from "@racer/devtools/analysis";
import type { TraceEvent } from "@racer/devtools/analysis";
import { evaluate } from "@racer/devtools/cdp";
import type { Session } from "@racer/devtools/cdp";
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

const currentTick = async (page: Session): Promise<number> =>
  await evaluate(
    page,
    "globalThis.__rushlineProfile ? globalThis.__rushlineProfile.info().tick : -1",
    Schema.Number
  );

export const waitForTick = async (
  page: Session,
  tick: number,
  deadline: number
): Promise<number> => {
  const now = await currentTick(page);
  if (now >= tick) {
    return now;
  }
  if (Date.now() > deadline) {
    throw new Error(`The race never reached tick ${tick}; it is at ${now}.`);
  }
  await sleep(POLL_MS);
  return await waitForTick(page, tick, deadline);
};

export const waitForCountdown = async (
  page: Session,
  deadline: number
): Promise<void> => {
  await waitForTick(page, 0, deadline);
  if ((await currentTick(page)) === 0) {
    await sleep(COUNTDOWN_PROBE_MS);
    if ((await currentTick(page)) === 0) {
      return;
    }
  }
  if (Date.now() > deadline) {
    throw new Error("The race never held a countdown.");
  }
  await sleep(POLL_MS);
  await waitForCountdown(page, deadline);
};

export const shoot = async (
  page: Session,
  options: Options,
  run: number,
  ticks: readonly number[],
  deadline: number
): Promise<string[]> => {
  const [next, ...rest] = ticks;
  if (next === undefined) {
    return [];
  }
  const reached = await waitForTick(page, next, deadline);
  const { data } = await page.call(
    "Page.captureScreenshot",
    { format: "png" },
    screenshot
  );
  const file = path.join(
    options.out,
    `${options.label}-run${run}-tick${reached}.png`
  );
  await writeFile(file, data, { encoding: "base64" });
  return [file, ...(await shoot(page, options, run, rest, deadline))];
};

export interface Collected {
  readonly raw: unknown[];
  readonly events: TraceEvent[];
}

const worthKeeping = (event: TraceEvent): boolean =>
  event.name !== TASK_EVENT || (event.dur ?? 0) >= SHORT_TASK_MICROS;

export const startTrace = async (
  page: Session,
  into: Collected,
  categories: readonly string[]
) => {
  page.on("Tracing.dataCollected", collected, ({ value }) => {
    for (const each of value) {
      const event = decodeEvent(each);
      if (worthKeeping(event)) {
        into.raw.push(each);
        into.events.push(event);
      }
    }
  });
  await page.send("Tracing.start", {
    traceConfig: { includedCategories: [...categories] },
    transferMode: "ReportEvents",
  });
};

export const stopTrace = async (page: Session) => {
  const { promise: complete, resolve } = Promise.withResolvers<boolean>();
  page.on("Tracing.tracingComplete", Schema.Unknown, () => {
    resolve(true);
  });
  await page.send("Tracing.end");
  await complete;
};

export const pageClock = async (page: Session): Promise<number> =>
  await evaluate(
    page,
    `(console.timeStamp(${JSON.stringify(clockMark)}), performance.now())`,
    Schema.Number
  );
