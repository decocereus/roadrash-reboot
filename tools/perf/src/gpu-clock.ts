import path from "node:path";

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import type { GpuFrame } from "./gpu-frame-reads.ts";
import { failed } from "./gpu-rv.ts";
import { MeasurementFailed } from "./measurement-failed.ts";

const SYSFS = "/sys";
const EVERY = "1 second";
const SLOW_BELOW_OF_MAX = 0.6;
const FAST_AT_MOST = 0.2;
const SLOW_AT_LEAST = 0.8;
const PACKAGE_ZONE = "x86_pkg_temp";
const CORE_DIR = /^cpu\d+$/u;

export const clockStates = ["fast", "slow", "mixed"] as const;

export type ClockState = (typeof clockStates)[number];

const celsius = Schema.Struct({ max: Schema.Number, mean: Schema.Number });

export const windowClock = Schema.Struct({
  meanMhz: Schema.Number,
  packageC: Schema.NullOr(celsius),
  readings: Schema.Number,
  slowShare: Schema.Number,
  state: Schema.Literals(clockStates),
});

export type WindowClock = typeof windowClock.Type;

export type ClockSource =
  | { readonly kind: "absent"; readonly reason: string }
  | {
      readonly cores: readonly string[];
      readonly kind: "cpufreq";
      readonly maxMhz: number;
      readonly packageTemp: string | null;
    };

export interface ClockReading {
  readonly at: number;
  readonly mhz: number;
  readonly packageC: number | null;
}

interface ClockLog {
  failure: string | null;
  readonly readings: ClockReading[];
}

const numberIn = Effect.fnUntraced(function* numberIn(file: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(file)
    .pipe(Effect.mapError(failed(`reading ${file}`)));
  const value = Number(text.trim());
  if (!Number.isFinite(value)) {
    return yield* new MeasurementFailed({
      lane: "gpu",
      message: `${file} reads "${text.trim()}", not a number`,
    });
  }
  return value;
});

const packageZone = Effect.fnUntraced(function* packageZone(root: string) {
  const fs = yield* FileSystem.FileSystem;
  const thermal = path.join(root, "class/thermal");
  if (!(yield* fs.exists(thermal))) {
    return null;
  }
  for (const zone of yield* fs.readDirectory(thermal)) {
    const type = path.join(thermal, zone, "type");
    if (
      (yield* fs.exists(type)) &&
      (yield* fs.readFileString(type)).trim() === PACKAGE_ZONE
    ) {
      return path.join(thermal, zone, "temp");
    }
  }
  return null;
});

export const probeClock = Effect.fnUntraced(function* probeClock(
  root: string = SYSFS
) {
  const fs = yield* FileSystem.FileSystem;
  const cpus = path.join(root, "devices/system/cpu");
  const listed = (yield* fs.exists(cpus)) ? yield* fs.readDirectory(cpus) : [];
  const cores: string[] = [];
  for (const name of listed.filter((each) => CORE_DIR.test(each)).toSorted()) {
    const file = path.join(cpus, name, "cpufreq/scaling_cur_freq");
    if (yield* fs.exists(file)) {
      cores.push(file);
    }
  }
  const [first] = cores;
  if (first === undefined) {
    const absent: ClockSource = {
      kind: "absent",
      reason: `no ${cpus}/cpu*/cpufreq/scaling_cur_freq on this host, so no window has a clock state`,
    };
    return absent;
  }
  const source: ClockSource = {
    cores,
    kind: "cpufreq",
    maxMhz:
      (yield* numberIn(path.join(path.dirname(first), "cpuinfo_max_freq"))) /
      1000,
    packageTemp: yield* packageZone(root),
  };
  return source;
});

const readClock = Effect.fnUntraced(function* readClock(
  source: Extract<ClockSource, { kind: "cpufreq" }>
) {
  let kilohertz = 0;
  for (const core of source.cores) {
    kilohertz += yield* numberIn(core);
  }
  const reading: ClockReading = {
    at: yield* Clock.currentTimeMillis,
    mhz: kilohertz / source.cores.length / 1000,
    packageC:
      source.packageTemp === null
        ? null
        : (yield* numberIn(source.packageTemp)) / 1000,
  };
  return reading;
});

const sampling = (
  source: Extract<ClockSource, { kind: "cpufreq" }>,
  log: ClockLog
) =>
  readClock(source).pipe(
    Effect.tap((reading) =>
      Effect.sync(() => {
        log.readings.push(reading);
      })
    ),
    Effect.andThen(Effect.sleep(EVERY)),
    Effect.forever,
    Effect.catchTag("MeasurementFailed", (stopped) =>
      Effect.sync(() => {
        log.failure = stopped.message;
      })
    )
  );

export const whileSampling = <A, E, R>(
  source: ClockSource,
  work: Effect.Effect<A, E, R>
) =>
  Effect.scoped(
    Effect.gen(function* whileSamplingClock() {
      const log: ClockLog = { failure: null, readings: [] };
      if (source.kind === "cpufreq") {
        yield* Effect.forkScoped(sampling(source, log));
      }
      const result = yield* work;
      if (log.failure !== null) {
        return yield* new MeasurementFailed({
          lane: "gpu",
          message: `reading the CPU clock failed during the window: ${log.failure}`,
        });
      }
      return { readings: [...log.readings], result };
    })
  );

const stateOf = (slowShare: number): ClockState => {
  if (slowShare <= FAST_AT_MOST) {
    return "fast";
  }
  if (slowShare >= SLOW_AT_LEAST) {
    return "slow";
  }
  return "mixed";
};

const meanOf = (values: readonly number[]): number =>
  values.reduce((sum, each) => sum + each, 0) / values.length;

export const windowClockOf = (
  readings: readonly ClockReading[],
  span: { readonly from: number; readonly to: number },
  maxMhz: number
): WindowClock | null => {
  const inside = readings.filter(
    (reading) => reading.at >= span.from && reading.at <= span.to
  );
  if (inside.length === 0) {
    return null;
  }
  const slowShare =
    inside.filter((reading) => reading.mhz < SLOW_BELOW_OF_MAX * maxMhz)
      .length / inside.length;
  const temperatures = inside.flatMap((reading) =>
    reading.packageC === null ? [] : [reading.packageC]
  );
  return {
    meanMhz: meanOf(inside.map((reading) => reading.mhz)),
    packageC:
      temperatures.length === 0
        ? null
        : { max: Math.max(...temperatures), mean: meanOf(temperatures) },
    readings: inside.length,
    slowShare,
    state: stateOf(slowShare),
  };
};

interface Timed {
  readonly frames: readonly GpuFrame[];
  readonly timeOrigin: number;
}

export const clockOfCapture = (
  source: ClockSource,
  readings: readonly ClockReading[],
  { frames, timeOrigin }: Timed
): WindowClock | null => {
  const [first] = frames;
  const last = frames.at(-1);
  if (source.kind === "absent" || first === undefined || last === undefined) {
    return null;
  }
  return windowClockOf(
    readings,
    {
      from: timeOrigin + first.start,
      to: timeOrigin + last.start + last.interval,
    },
    source.maxMhz
  );
};

export const clockText = (clock: WindowClock | null): string => {
  if (clock === null) {
    return "clock unread";
  }
  const heat =
    clock.packageC === null
      ? "package temperature unread"
      : `package ${clock.packageC.mean.toFixed(0)} C, peak ${clock.packageC.max.toFixed(0)} C`;
  return `clock ${clock.state} ${clock.meanMhz.toFixed(0)} MHz, slow share ${clock.slowShare.toFixed(2)} of ${clock.readings} readings, ${heat}`;
};

export const sourceText = (source: ClockSource): string =>
  source.kind === "absent"
    ? `info clock not recorded: ${source.reason}`
    : `info clock read once a second from ${source.cores.length} cores' scaling_cur_freq, slow below ${(SLOW_BELOW_OF_MAX * source.maxMhz).toFixed(0)} MHz (${SLOW_BELOW_OF_MAX} x cpuinfo_max_freq ${source.maxMhz.toFixed(0)} MHz); a window is fast at a slow share of ${FAST_AT_MOST} or less, slow at ${SLOW_AT_LEAST} or more, mixed otherwise; package temperature ${source.packageTemp ?? `unread: no ${PACKAGE_ZONE} thermal zone`}`;
