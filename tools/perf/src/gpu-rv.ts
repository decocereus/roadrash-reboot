import path from "node:path";

import { benchChildEnv } from "@racer/devtools/bench-turn";
import { profileFor } from "@racer/devtools/claim";
import { ToolProcesses } from "@racer/devtools/process";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

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
        )
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
) => {
  if (pids.length === 0) {
    return Effect.succeed(new Map<number, number>());
  }
  return platform === "linux"
    ? linuxSeconds(pids, procRoot)
    : psCpuSeconds(pids);
};

interface BusyRenderer {
  readonly pid: number;
  readonly share: number;
}

const busyRenderers = Effect.fnUntraced(function* busyRenderers(
  run: string,
  platform: NodeJS.Platform,
  timing: ParkTiming
) {
  const pids = yield* renderersOf(run);
  const before = yield* cpuSeconds(pids, platform, timing.procRoot);
  yield* Effect.sleep(Duration.millis(timing.sampleMs));
  const after = yield* cpuSeconds(pids, platform, timing.procRoot);
  return pids.flatMap((pid): BusyRenderer[] => {
    const start = before.get(pid);
    const end = after.get(pid);
    if (start === undefined || end === undefined) {
      return [];
    }
    const share = (end - start) / (timing.sampleMs / 1000);
    return share > BUSY_SHARE ? [{ pid, share }] : [];
  });
});

const slotOf = (run: string): string =>
  /-s(?<slot>\d)$/u.exec(run)?.groups?.slot ?? "unknown";

export const assertParked = Effect.fnUntraced(function* assertParked(
  idle: string,
  platform: NodeJS.Platform,
  timing: ParkTiming = PARK_TIMING
) {
  let seen = "";
  for (let attempt = 1; attempt <= timing.tries; attempt += 1) {
    const page = yield* rv(["js", "--run", idle, "location.pathname"]);
    const busy = yield* busyRenderers(idle, platform, timing);
    if (page === JSON.stringify(PARK) && busy.length === 0) {
      return attempt;
    }
    const load = busy
      .map(({ pid, share }) => `pid ${pid} at ${(share * 100).toFixed(0)}%`)
      .join(", ");
    seen = `page ${page}${busy.length > 0 ? `, busy renderers ${load} of a core` : ""}`;
    if (attempt < timing.tries) {
      yield* Effect.sleep(Duration.millis(timing.gapMs));
    }
  }
  return yield* new MeasurementFailed({
    lane: "gpu",
    message: `The idle run ${idle} in slot ${slotOf(idle)} is not parked on ${PARK} after ${timing.tries} tries ${timing.gapMs / 1000} s apart (${seen}). A second race drawing there would be measured with this one. Park that slot on ${PARK} or stop it, then start the campaign again.`,
  });
});
