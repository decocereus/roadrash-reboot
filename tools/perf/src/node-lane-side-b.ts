import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { NodeProfile, Observation } from "./budgets.ts";
import { LOBBY_BENCH } from "./lobby-bench.ts";
import {
  calibrationFailures,
  nodeEnvironment,
  nodeSample,
  p95Of,
  runChild,
  scalesAcross,
} from "./node-lane.ts";
import type { NodeSample } from "./node-lane.ts";
import type { ChildRecord } from "./node.ts";
import { median } from "./result.ts";
import { ROAD_LIFE } from "./road-life.ts";
import { WINDOW_TICKS } from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";
import type { Side } from "./sides.ts";

const SIDE_B_RUNS = 5;

export const sideBRecord = Schema.Struct({
  calibrations: Schema.Array(nodeSample),
  runs: Schema.Array(nodeSample),
});

export type SideBLane = typeof sideBRecord.Type;

interface SideBWindow {
  readonly id: string;
  readonly metric: string;
  readonly shortfall: (record: ChildRecord) => string | null;
  readonly task: "lobby" | "roadLife";
}

export const lobbyWindow: SideBWindow = {
  id: LOBBY_BENCH.id,
  metric: "lobby.tick.p95",
  shortfall: ({ lobby }) => {
    if (!lobby) {
      return "wrote no lobby window";
    }
    return lobby.fewestMoving >= LOBBY_BENCH.leastMoving &&
      lobby.routed >= LOBBY_BENCH.leastRouted
      ? null
      : `fewestMoving=${lobby.fewestMoving} routed=${lobby.routed} expected at least ${LOBBY_BENCH.leastMoving} and ${LOBBY_BENCH.leastRouted}`;
  },
  task: "lobby",
};

export const roadLifeWindow: SideBWindow = {
  id: ROAD_LIFE.id,
  metric: "roadLife.tick.p95",
  shortfall: ({ roadLife }) => {
    if (!roadLife) {
      return "wrote no road life window";
    }
    return roadLife.fewestCrossCars >= ROAD_LIFE.leastCrossCars &&
      roadLife.fewestWalkers >= ROAD_LIFE.leastWalkers &&
      roadLife.mostRacersAtCrossing >= ROAD_LIFE.leastRacersAtCrossing
      ? null
      : `fewestCrossCars=${roadLife.fewestCrossCars} fewestWalkers=${roadLife.fewestWalkers} mostRacersAtCrossing=${roadLife.mostRacersAtCrossing} expected at least ${ROAD_LIFE.leastCrossCars} and ${ROAD_LIFE.leastRacersAtCrossing}`;
  },
  task: "roadLife",
};

export const sideBWindows = [lobbyWindow, roadLifeWindow] as const;

export const sideBLane = Effect.fn("node.sideB")(function* sideBLane(
  { id, task }: SideBWindow,
  side: Side,
  calibrator: Scenario,
  dir: string
) {
  const calibrate = (index: number) =>
    runChild(side, "calibrate", calibrator, dir, `${id}-calibrate-${index}`);
  const calibrations = [yield* calibrate(0)];
  const runs: NodeSample[] = [];
  for (let run = 0; run < SIDE_B_RUNS; run += 1) {
    runs.push(yield* runChild(side, task, { id }, dir, `run-${run}`));
    calibrations.push(yield* calibrate(run + 1));
  }
  const lane: SideBLane = { calibrations, runs };
  return lane;
});

const workloadFailures = (
  { id, shortfall }: SideBWindow,
  lane: SideBLane
): string[] =>
  lane.runs.flatMap(({ file, record }) => {
    const where = `FAIL workload ${id} ${file}`;
    if (record.durations?.length !== WINDOW_TICKS) {
      return [`${where} wrote ${record.durations?.length ?? 0} ticks`];
    }
    const short = shortfall(record);
    return short === null ? [] : [`${where} ${short}`];
  });

export const sideBVerdict = (
  window: SideBWindow,
  lane: SideBLane,
  profiles: Readonly<Record<string, NodeProfile>>
) => {
  const [first] = lane.calibrations;
  const environment = first ? nodeEnvironment(first.record) : "node-unknown";
  const profile = profiles[environment];
  const failures = [
    ...workloadFailures(window, lane),
    ...calibrationFailures(window, lane, environment, profile),
  ];
  if (failures.length > 0 || !profile) {
    return { failures, observations: [] };
  }
  const { failures: unstable, scales } = scalesAcross(
    window,
    lane.calibrations,
    lane.runs.length,
    profile.calibration
  );
  if (unstable.length > 0) {
    return { failures: unstable, observations: [] };
  }
  const measured = lane.runs.map(
    ({ record }, index) =>
      p95Of(record.durations ?? []) / (scales[index]?.scale ?? Number.NaN)
  );
  const observation: Observation = {
    environment,
    lane: "node",
    metric: window.metric,
    note: `runs=${measured.length} scale=${median(scales.map((each) => each.scale)).toFixed(3)}`,
    paired: null,
    runs: { a: [], b: measured },
    scenario: null,
    value: median(measured),
  };
  return { failures, observations: [observation] };
};
