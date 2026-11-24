import type { Observation } from "./budgets.ts";
import type { ChildRecord } from "./node.ts";
import { median, p95Of } from "./result.ts";
import { roomPartSeeds, roomParts } from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";

export type RoomRun = NonNullable<ChildRecord["room"]>;

const sameSeeds = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length &&
  left.every((seed, index) => seed === right[index]);

const coverageOf = (parts: readonly string[]) => parts.join(" ");

export const roomCoverageFailures = (
  scenario: Scenario,
  runs: readonly RoomRun[]
): string[] => {
  const parts = runs
    .map((run) => run.part)
    .toSorted((left, right) => left - right);
  const covered =
    sameSeeds(parts, roomParts) &&
    runs.every((run) =>
      sameSeeds(run.seeds, roomPartSeeds(scenario.bench, run.part))
    );
  return covered
    ? []
    : [
        `FAIL node ${scenario.id} RoomSeedsIncomplete measured ${coverageOf(runs.map((run) => `${run.part}:[${run.seeds.join(",")}]`))}, the registry wants ${coverageOf(roomParts.map((part) => `${part}:[${roomPartSeeds(scenario.bench, part).join(",")}]`))}`,
      ];
};

export const roomObservations = (
  scenario: Scenario,
  runs: readonly RoomRun[],
  environment: string,
  scale: number
): readonly Observation[] => {
  const observed = (
    metric: string,
    note: string,
    measured: readonly number[]
  ): Observation => ({
    environment,
    lane: "node",
    metric,
    note,
    paired: null,
    runs: { a: [], b: measured },
    scenario: scenario.id,
    value: median(measured),
  });
  const seeds = new Set(runs.flatMap((run) => run.seeds)).size;
  const pooled = (
    metric: string,
    statistic: (values: readonly number[]) => number,
    of: (run: RoomRun) => readonly number[]
  ) => ({
    ...observed(
      metric,
      `runs=${runs.length} seeds=${seeds} pooled scale=${scale.toFixed(3)}`,
      runs.map((run) => statistic(of(run)) / scale)
    ),
    value: statistic(runs.flatMap(of)) / scale,
  });
  const allocated = (metric: string, of: (run: RoomRun) => number) =>
    observed(metric, `runs=${runs.length}`, runs.map(of));
  return [
    pooled("room.tick.p95", p95Of, (run) => run.tick),
    pooled("room.confirm.p95", p95Of, (run) => run.confirm),
    pooled("room.rollback.p95", p95Of, (run) => run.rollback),
    pooled("room.checkpoint.p50", median, (run) => run.checkpoint),
    allocated("room.allocatedBytesPerTick", (run) => run.allocated.server),
    allocated(
      "room.client.allocatedBytesPerTick",
      (run) => run.allocated.client
    ),
    allocated("room.frame.allocatedBytesPerTick", (run) => run.allocated.frame),
  ];
};
