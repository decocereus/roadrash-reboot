import path from "node:path";

import { benchChildEnv } from "@racer/devtools/bench-turn";
import { profileFor } from "@racer/devtools/claim";
import { ToolProcesses } from "@racer/devtools/process";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { MeasurementFailed } from "./measurement-failed.ts";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
export const RV = path.join(REPO_ROOT, "tools/verify/rushline.ts");
export const PARK = "/kit";
export const OPEN_TIMEOUT_S = 90;
export const WINDOW_TIMEOUT_S = 240;

const BUSY_SHARE = 0.05;

export interface ParkTiming {
  readonly gapMs: number;
  readonly procRoot: string;
  readonly sampleMs: number;
  readonly tries: number;
}

const PARK_TIMING: ParkTiming = {
  gapMs: 2000,
  procRoot: "/proc",
  sampleMs: 2000,
  tries: 4,
};

export const failed =
  (message: string) => (cause: { readonly message: string }) =>
    new MeasurementFailed({
      cause,
      lane: "gpu",
      message: `${message}: ${cause.message}`,
    });

export const rv = (args: readonly string[]) =>
  ToolProcesses.use((processes) =>
    processes.run(process.execPath, [RV, ...args], {
      cwd: REPO_ROOT,
      env: benchChildEnv(),
    })
  ).pipe(
    Effect.map((output) => output.stdout.trim()),
    Effect.mapError(failed(`rv ${args.slice(0, 3).join(" ")}`))
  );

export const consoleErrors = (run: string) =>
  rv(["console", "--run", run, "errors"]).pipe(
    Effect.map((text) =>
      Number(
        /^(?<count>\d+) lines from /mu.exec(text)?.groups?.count ?? Number.NaN
      )
    )
  );

const renderersOf = (run: string) => {
  const profile = `--user-data-dir=${profileFor(run)}`;
  return ToolProcesses.use((processes) => processes.listed).pipe(
    Effect.map((listed) =>
      listed
        .filter(({ command }) => {
          const words = command.split(" ");
          return words.includes("--type=renderer") && words.includes(profile);
        })
        .map(({ pid }) => pid)
    ),
    Effect.mapError(failed(`listing ${run}'s renderers`))
  );
};

export const statTicks = (stat: string): number => {
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  return Number(fields[11]) + Number(fields[12]);
};

export const psSeconds = (time: string): number =>
  time.split(":").reduce((seconds, part) => seconds * 60 + Number(part), 0);

const linuxSeconds = Effect.fnUntraced(function* linuxSeconds(
  pids: readonly number[],
  procRoot: string
) {
  const fs = yield* FileSystem.FileSystem;
  const tick = Number(
    (yield* ToolProcesses.use((processes) =>
      processes.run("getconf", ["CLK_TCK"])
    ).pipe(Effect.mapError(failed("getconf CLK_TCK")))).stdout.trim()
  );
  const seconds = new Map<number, number>();
  for (const pid of pids) {
    const stat = yield* fs
      .readFileString(path.join(procRoot, String(pid), "stat"))
      .pipe(
        Effect.catchReason("PlatformError", "NotFound", () =>
          Effect.succeed(null)
        ),
        Effect.mapError(failed(`reading /proc/${pid}/stat`))
      );
    if (stat !== null) {
      seconds.set(pid, statTicks(stat) / tick);
    }
  }
  return seconds;
});

const psCpuSeconds = (pids: readonly number[]) =>
  ToolProcesses.use((processes) =>
    processes.run("ps", ["-A", "-o", "pid=,time="])
  ).pipe(
    Effect.map(({ stdout }) => {
      const wanted = new Set(pids);
      return new Map(
        stdout.split("\n").flatMap((line) => {
          const [pid, time] = line.trim().split(/\s+/u);
          return pid === undefined ||
            time === undefined ||
            !wanted.has(Number(pid))
            ? []
            : [[Number(pid), psSeconds(time)] as const];
        })
      );
    }),
    Effect.mapError(failed("ps"))
  );

const cpuSeconds = (
  pids: readonly number[],
  platform: NodeJS.Platform,
  procRoot: string
) => (platform === "linux" ? linuxSeconds(pids, procRoot) : psCpuSeconds(pids));

const snapshot = Effect.fnUntraced(function* snapshot(
  pids: readonly number[],
  platform: NodeJS.Platform,
  procRoot: string
) {
  const seconds = yield* cpuSeconds(pids, platform, procRoot);
  return { at: yield* Clock.monotonicTimeNanos, seconds };
});

const parkStates = ["quiet", "busy", "unknown"] as const;

const busyRenderer = Schema.Struct({
  pid: Schema.Number,
  share: Schema.Number,
});

export const parkReading = Schema.Struct({
  page: Schema.NullOr(Schema.String),
  reason: Schema.NullOr(Schema.String),
  renderers: Schema.Array(busyRenderer),
  run: Schema.String,
  slot: Schema.String,
  state: Schema.Literals(parkStates),
  tries: Schema.Number,
});

export type ParkReading = typeof parkReading.Type;

type Attempt =
  | { readonly kind: "quiet" }
  | {
      readonly kind: "busy";
      readonly page: string;
      readonly renderers: readonly (typeof busyRenderer.Type)[];
    }
  | { readonly kind: "unsettled"; readonly reason: string };

const unsettled = (reason: string): Attempt => ({ kind: "unsettled", reason });

const sameSet = (left: readonly number[], right: readonly number[]): boolean =>
  left.length === right.length && left.every((pid) => right.includes(pid));

const attemptPark = Effect.fnUntraced(function* attemptPark(
  idle: string,
  platform: NodeJS.Platform,
  timing: ParkTiming
) {
  const page = yield* rv(["js", "--run", idle, "location.pathname"]);
  if (page !== JSON.stringify(PARK)) {
    const away: Attempt = { kind: "busy", page, renderers: [] };
    return away;
  }
  const pids = yield* renderersOf(idle);
  if (pids.length === 0) {
    return unsettled(`no renderer of ${idle} was found`);
  }
  const before = yield* snapshot(pids, platform, timing.procRoot);
  yield* Effect.sleep(Duration.millis(timing.sampleMs));
  const after = yield* snapshot(pids, platform, timing.procRoot);
  const listedAfter = yield* renderersOf(idle);
  const counted = pids.every(
    (pid) => before.seconds.has(pid) && after.seconds.has(pid)
  );
  if (!counted || !sameSet(pids, listedAfter)) {
    return unsettled(`the renderers of ${idle} changed during the sample`);
  }
  const elapsed = Number(after.at - before.at) / 1e9;
  const renderers = pids.flatMap((pid) => {
    const share =
      ((after.seconds.get(pid) ?? 0) - (before.seconds.get(pid) ?? 0)) /
      elapsed;
    return share > BUSY_SHARE ? [{ pid, share }] : [];
  });
  const outcome: Attempt =
    renderers.length === 0
      ? { kind: "quiet" }
      : { kind: "busy", page, renderers };
  return outcome;
});

const slotOf = (run: string): string =>
  /-s(?<slot>\d)$/u.exec(run)?.groups?.slot ?? "unknown";

const readingOf = (
  idle: string,
  attempt: Attempt,
  tries: number
): ParkReading => {
  const where = { run: idle, slot: slotOf(idle), tries };
  switch (attempt.kind) {
    case "quiet": {
      return {
        ...where,
        page: JSON.stringify(PARK),
        reason: null,
        renderers: [],
        state: "quiet",
      };
    }
    case "busy": {
      return {
        ...where,
        page: attempt.page,
        reason: null,
        renderers: attempt.renderers,
        state: "busy",
      };
    }
    case "unsettled": {
      return {
        ...where,
        page: null,
        reason: attempt.reason,
        renderers: [],
        state: "unknown",
      };
    }
    default: {
      return attempt satisfies never;
    }
  }
};

export const readPark = Effect.fnUntraced(function* readPark(
  idle: string,
  platform: NodeJS.Platform,
  timing: ParkTiming = PARK_TIMING
) {
  let last: Attempt = unsettled("the park check never ran");
  for (let attempt = 1; attempt <= timing.tries; attempt += 1) {
    last = yield* attemptPark(idle, platform, timing).pipe(
      Effect.catchTag("MeasurementFailed", (unread) =>
        Effect.succeed(unsettled(unread.message))
      )
    );
    if (last.kind === "quiet") {
      return readingOf(idle, last, attempt);
    }
    if (attempt < timing.tries) {
      yield* Effect.sleep(Duration.millis(timing.gapMs));
    }
  }
  return readingOf(idle, last, timing.tries);
});

export const parkText = (park: ParkReading): string => {
  const at = `idle run ${park.run} in slot ${park.slot}`;
  switch (park.state) {
    case "quiet": {
      return park.tries > 1
        ? `${at} quiet after ${park.tries} park checks`
        : "";
    }
    case "busy": {
      const load = park.renderers
        .map(
          ({ pid, share }) =>
            `pid ${pid} at ${(share * 100).toFixed(0)}% of a core`
        )
        .join(", ");
      return `${at} not proved parked after ${park.tries} park checks: page ${park.page ?? "unread"}${load === "" ? "" : `, busy ${load}`}`;
    }
    case "unknown": {
      return `${at} park unknown after ${park.tries} park checks: ${park.reason ?? "no reason"}`;
    }
    default: {
      return park.state satisfies never;
    }
  }
};
