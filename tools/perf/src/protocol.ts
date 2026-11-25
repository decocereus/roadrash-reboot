import { createHash } from "node:crypto";

export const measurementProtocol = {
  layoutPaddingBytes: 16_384,
  nodeFlags: ["--no-concurrent-recompilation"],
  pairs: { allocation: 3, timing: 5 },
  shares: { p95: 0.95, p99: 0.99, stampTrim: 0.05 },
  sideADivisor: "median of side A's sim.tick.p95 over the timing pairs",
  sideBRuns: { windows: 5, snapshotAndRoom: 3 },
  statistics: {
    "lobby.tick.p95":
      "p95 of each run's lobby window, median of the side-B runs",
    "plazaPack.tick.p95":
      "p95 of each run's plaza-pack window, median of the side-B runs",
    "roadLife.tick.p95":
      "p95 of each run's road-life window, median of the side-B runs",
    "room.checkpoint.p50":
      "median of every timed checkpoint of the eight pooled races, tick 0 to the window's end",
    "room.confirm.p95": "p95 of every timed tick of the eight pooled races",
    "room.rollback.p95": "p95 of every timed tick of the eight pooled races",
    "room.tick.p95": "p95 of every timed tick of the eight pooled races",
    "sim.allocatedBytesPerTick":
      "one sampled window's bytes per tick; A/B is the median of the pairs' B/A",
    "sim.tick.p95":
      "p95 of a child's pooled timed windows; A/B is the median of the pairs' B/A",
    "sim.tick.p99":
      "p99 of a child's pooled timed windows; A/B is the median of the pairs' B/A",
    "sim.ticksPerSecond":
      "1000 over the mean tick of a child's pooled timed windows; A/B is the median of the pairs' B/A",
    "snapshot.hash.p95": "p95 of each run's window, median of the side-B runs",
    "snapshot.restore.p95":
      "p95 of each run's window, median of the side-B runs",
    "snapshot.write.p95": "p95 of each run's window, median of the side-B runs",
    "timing.stamp.trimmedMean":
      "mean of each run's window without its slowest stampTrim share, median of the side-B runs",
  },
  timedWindows: 4,
  warmUp: {
    maxWindows: 10,
    minWindows: 3,
    rule: "from minWindows on, a window settles the child when it is no more than tolerance faster than the fastest window before it",
    tolerance: 0.03,
  },
  windowTicks: 601,
} as const;

type Widened<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends readonly (infer Item)[]
      ? readonly Widened<Item>[]
      : { readonly [Key in keyof T]: Widened<T[Key]> };

export type MeasurementProtocol = Widened<typeof measurementProtocol>;

export const protocolDigest = (protocol: MeasurementProtocol): string =>
  createHash("sha256").update(JSON.stringify(protocol)).digest("hex");

export const currentProtocol = protocolDigest(measurementProtocol);

interface Compatibility {
  readonly change: string;
  readonly evidence: string;
  readonly judgedUnder: string;
  readonly measured: string;
  readonly reason: string;
}

const compatibleProtocols: readonly Compatibility[] = [
  {
    change:
      "the warm-up settled a child when two consecutive windows agreed within 3%, from the second window on",
    evidence:
      "the perf-job artifacts of 2026-11-19 to 11-24: 2,158 warm-up sequences replayed under both rules (research/2026-11-25-perf-gate-rules, settle-rule.py)",
    judgedUnder:
      "ca2dcefd8b88a6521b6d67faf37873ad98108f9b1461950208dfc353790dc5ae",
    measured:
      "8cd726fdccd5d4c6735eb9306ba778e4b26db72c38cce2d57c3b4bb1098fdd23",
    reason:
      "no new low never stops later than two agreeing windows; of 2,158 recorded children 74 stop earlier, and their timed mean moves -2.8% to +1.2% off the AMD EPYC 9V45 and up to +5.6% on it, inside the spread the recorded limits already carry",
  },
];

export const protocolAccepted = (measured: string, current: string): boolean =>
  measured === current ||
  compatibleProtocols.some(
    (each) => each.measured === measured && each.judgedUnder === current
  );
