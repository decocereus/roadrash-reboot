import { loadavg } from "node:os";

import { ToolProcesses } from "@racer/devtools/process";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

const SECONDS_PER_MINUTE = 60;
const KB_PER_MB = 1024;

export interface ProcessRow {
  readonly cpuSeconds: number;
  readonly parent: number;
  readonly rssMb: number;
}

export type ProcessTable = ReadonlyMap<number, ProcessRow>;

const secondsOf = (time: string): number => {
  const parts = time.replace("-", ":").split(":").map(Number);
  return parts.reduce((total, part) => total * SECONDS_PER_MINUTE + part, 0);
};

export const readProcesses = Effect.gen(function* readProcesses() {
  const processes = yield* ToolProcesses;
  const { stdout } = yield* processes.run("ps", [
    "-A",
    "-o",
    "pid=,ppid=,time=,rss=",
  ]);
  const table = new Map<number, ProcessRow>();
  for (const line of stdout.split("\n")) {
    const [pid, parent, time, rss] = line.trim().split(/\s+/u);
    if (
      pid !== undefined &&
      parent !== undefined &&
      time !== undefined &&
      rss !== undefined
    ) {
      table.set(Number(pid), {
        cpuSeconds: secondsOf(time),
        parent: Number(parent),
        rssMb: Number(rss) / KB_PER_MB,
      });
    }
  }
  return table;
});

export const otherCoresBetween = (
  before: ProcessTable,
  after: ProcessTable,
  seconds: number,
  server: number | null
): number => {
  const serverParent = server === null ? null : after.get(server)?.parent;
  const isOurs = (pid: number, row: ProcessRow): boolean =>
    pid === process.pid ||
    pid === server ||
    pid === serverParent ||
    row.parent === process.pid;
  let used = 0;
  for (const [pid, row] of after) {
    const earlier = before.get(pid);
    if (earlier && !isOurs(pid, row)) {
      used += Math.max(0, row.cpuSeconds - earlier.cpuSeconds);
    }
  }
  return used / seconds;
};

export const sleepUntil = Effect.fn("rooms.load.sleepUntil")(
  function* sleepUntil(at: number) {
    const now = yield* Clock.currentTimeMillis;
    yield* Effect.sleep(Math.max(0, at - now));
  }
);

export const oneMinuteLoad = (): number => loadavg()[0] ?? 0;

export const workerdOn = Effect.fn("rooms.load.workerdOn")(function* workerdOn(
  url: string
) {
  const { hostname, port } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    return null;
  }
  const processes = yield* ToolProcesses;
  const pid = yield* processes.listenerOf(Number(port));
  if (pid === null) {
    return null;
  }
  const command = yield* processes.commandOf(pid);
  return command.includes("workerd") ? pid : null;
});
