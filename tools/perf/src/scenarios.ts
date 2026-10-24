import { benchRaces, benchSetup } from "@racer/career/bench";
import type { Bench } from "@racer/career/bench";
import { benchWindows } from "@racer/sim/bench-window";
import type { TickWindow } from "@racer/sim/bench-window";
import {
  observeWorkload,
  RIVALS_AHEAD_METRES,
  workloadColumns,
  workloadModes,
} from "@racer/sim/bench-workload";
import type { WorkloadColumns } from "@racer/sim/bench-workload";
import { neutralInput } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceRun } from "@racer/sim/race-run";
import type { RaceView } from "@racer/sim/race-view";
import { PLAYER_RIDER, TICK_SECONDS } from "@racer/sim/state";
import type { InputFrame, RaceSetup, RiderInput } from "@racer/sim/state";
import * as Schema from "effect/Schema";

import { digestOf } from "./result.ts";

const VALIDATOR_VERSION = 1;
export const WINDOW_TICKS = 601;
const WARMUP_TICKS = 600;
export const SEARCH_TICKS = 7200;
const SPEED_FLOOR = 20;

type ScenarioId = "reference-v1" | "pack-riding-v1";

interface Band {
  readonly min: number;
  readonly max: number;
  readonly total: number;
}

interface Quality {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly ratio: number;
  readonly rung: number;
}

export interface Scenario {
  readonly id: ScenarioId;
  readonly bench: Bench;
  readonly window: TickWindow;
  readonly floor: number;
  readonly band: Band;
  readonly minSpeed: number;
  readonly workloadDigest: string;
  readonly racers: number;
  readonly police: number;
  readonly quality: Quality;
}

const quality: Quality = {
  height: 860,
  ratio: 2,
  rung: 0,
  scale: 2,
  width: 1512,
};

export const scenarios: readonly Scenario[] = [
  {
    band: { max: 10, min: 10, total: 6010 },
    bench: "reference",
    floor: 0,
    id: "reference-v1",
    minSpeed: 23.992932993980144,
    police: 1,
    quality,
    racers: 15,
    window: benchWindows.reference,
    workloadDigest:
      "7b5107a7be04ad2a05dd03176c529d24b63f231d3579a62a57c19beeab844497",
  },
  {
    band: { max: 13, min: 11, total: 7395 },
    bench: "stress",
    floor: 6,
    id: "pack-riding-v1",
    minSpeed: 35.08969553929572,
    police: 8,
    quality,
    racers: 15,
    window: benchWindows.stress,
    workloadDigest:
      "ac96a3731ddb956b4e167e91650023b167ae1ab1943f433b8ee5f92248abeb1c",
  },
];

export const workloadRows = Schema.Struct({
  ahead: Schema.Array(Schema.Number),
  modes: Schema.Array(Schema.String),
  speeds: Schema.Array(Schema.Number),
  ticks: Schema.Array(Schema.Number),
});

export type WorkloadRows = typeof workloadRows.Type;

interface WorkloadProblem {
  readonly tick: number;
  readonly field: "tick" | "mode" | "speed" | "ahead" | "total" | "samples";
  readonly actual: string;
  readonly expected: string;
}

const problem = (
  tick: number,
  field: WorkloadProblem["field"],
  actual: string | number,
  expected: string
): WorkloadProblem => ({ actual: String(actual), expected, field, tick });

export const validateWorkload = (
  scenario: Scenario,
  rows: WorkloadRows
): WorkloadProblem | null => {
  const { band, floor, window } = scenario;
  const lowest = Math.max(floor, band.min);
  let total = 0;
  for (let index = 0; index < WINDOW_TICKS; index += 1) {
    const tick = window.from + index;
    const seen = rows.ticks[index];
    if (seen !== tick) {
      return problem(tick, "tick", seen ?? "missing", String(tick));
    }
    const mode = rows.modes[index] ?? "missing";
    if (mode !== "riding") {
      return problem(tick, "mode", mode, "riding");
    }
    const speed = rows.speeds[index] ?? Number.NaN;
    if (!(Number.isFinite(speed) && speed >= SPEED_FLOOR)) {
      return problem(tick, "speed", speed, `>= ${SPEED_FLOOR} m/s`);
    }
    const ahead = rows.ahead[index] ?? -1;
    if (ahead < lowest || ahead > band.max) {
      return problem(tick, "ahead", ahead, `${lowest}..${band.max} rivals`);
    }
    total += ahead;
  }
  if (rows.ticks.length !== WINDOW_TICKS) {
    return problem(
      window.to,
      "samples",
      rows.ticks.length,
      String(WINDOW_TICKS)
    );
  }
  if (total !== band.total) {
    return problem(window.to, "total", total, String(band.total));
  }
  return null;
};

export const workloadDigestOf = (rows: WorkloadRows): string =>
  digestOf(rows.ticks, rows.modes, rows.ahead);

const withoutSignedZero = (values: Float64Array): Float64Array =>
  Float64Array.from(values, (value) => value + 0);

type Track = RaceSetup["track"];

type RaceSettings = Omit<
  Track["plan"],
  "chevrons" | "leadInLength" | "pieces" | "runoffLength" | "scenery" | "start"
>;

interface RaceTrack extends Omit<Track, "plan"> {
  readonly plan: RaceSettings;
}

const raceSettings = (plan: Track["plan"]): RaceSettings => ({
  features: plan.features,
  hazardsPerKilometre: plan.hazardsPerKilometre,
  id: plan.id,
  laneWidth: plan.laneWidth,
  lanesEachWay: plan.lanesEachWay,
  level: plan.level,
  name: plan.name,
  region: plan.region,
  roadblocks: plan.roadblocks,
  seed: plan.seed,
  shoulderWidth: plan.shoulderWidth,
  trafficPerKilometre: plan.trafficPerKilometre,
  vergeWidth: plan.vergeWidth,
});

const raceTrack = (track: Track): RaceTrack => ({
  ...track,
  curvature: withoutSignedZero(track.curvature),
  heading: withoutSignedZero(track.heading),
  plan: raceSettings(track.plan),
  slope: withoutSignedZero(track.slope),
  slopeRate: withoutSignedZero(track.slopeRate),
  worldX: withoutSignedZero(track.worldX),
  worldY: withoutSignedZero(track.worldY),
  worldZ: withoutSignedZero(track.worldZ),
});

export const scenarioHash = (scenario: Scenario): string => {
  const setup = benchSetup(scenario.bench);
  const track = raceTrack(setup.track);
  return digestOf({
    control: "pilot every rider in index order, then one step",
    race: benchRaces[scenario.bench],
    scenario,
    setup: digestOf({ ...setup, track }),
    tickSeconds: TICK_SECONDS,
    track: digestOf(track),
    validator: {
      aheadMetres: RIVALS_AHEAD_METRES,
      search: SEARCH_TICKS,
      speedFloor: SPEED_FLOOR,
      version: VALIDATOR_VERSION,
      warmup: WARMUP_TICKS,
      windowTicks: WINDOW_TICKS,
    },
  });
};

interface BenchRun {
  readonly view: RaceView;
  readonly step: () => void;
}

interface LegacyRun {
  readonly view: RaceView;
  readonly pilot: (slot: number, input: RiderInput) => void;
  readonly step: (inputs: readonly RiderInput[]) => void;
}

const stepperOf = (run: RaceRun | LegacyRun): (() => void) => {
  if ("pilot" in run) {
    const inputs: RiderInput[] = run.view.riders.map(() => ({
      ...neutralInput,
    }));
    return () => {
      for (let slot = 0; slot < inputs.length; slot += 1) {
        const input = inputs[slot];
        if (input) {
          run.pilot(slot, input);
        }
      }
      run.step(inputs);
    };
  }
  const frame: InputFrame = new Map();
  return () => {
    run.step(frame);
  };
};

export const benchRun = (bench: Bench): BenchRun => {
  const setup = benchSetup(bench);
  const run = createRaceRun({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
  });
  return { step: stepperOf(run), view: run.view };
};

const raceOver = (race: RaceView): boolean =>
  race.events.some(
    (event) =>
      event.rider === PLAYER_RIDER &&
      (event.kind === "finish" ||
        event.kind === "busted" ||
        event.kind === "wrecked")
  );

export const rowsOf = (
  columns: WorkloadColumns,
  count: number
): WorkloadRows => {
  const ticks: number[] = [];
  const modes: string[] = [];
  const speeds: number[] = [];
  const ahead: number[] = [];
  for (let index = 0; index < count; index += 1) {
    ticks.push(columns.ticks[index] ?? -1);
    modes.push(workloadModes[columns.modes[index] ?? -1] ?? "unknown");
    speeds.push(columns.speeds[index] ?? Number.NaN);
    ahead.push(columns.ahead[index] ?? -1);
  }
  return { ahead, modes, speeds, ticks };
};

export interface ObservedRace {
  readonly racers: number;
  readonly police: number;
  readonly rows: WorkloadRows;
}

export const observeRace = (bench: Bench, ticks: number): ObservedRace => {
  const columns = workloadColumns(ticks);
  const run = benchRun(bench);
  const police = run.view.riders.filter(
    (rider) => rider.profile.role === "police"
  ).length;
  let count = 0;
  while (count < ticks) {
    run.step();
    observeWorkload(run.view, columns, count);
    count += 1;
    if (raceOver(run.view)) {
      break;
    }
  }
  return {
    police,
    racers: run.view.riders.length - police,
    rows: rowsOf(columns, count),
  };
};

export interface Candidate {
  readonly from: number;
  readonly to: number;
  readonly min: number;
  readonly max: number;
  readonly total: number;
  readonly minSpeed: number;
}

const candidateAt = (
  rows: WorkloadRows,
  start: number,
  floor: number
): Candidate | null => {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let total = 0;
  let minSpeed = Number.POSITIVE_INFINITY;
  for (let index = start; index < start + WINDOW_TICKS; index += 1) {
    const speed = rows.speeds[index] ?? Number.NaN;
    const ahead = rows.ahead[index] ?? -1;
    if (
      rows.modes[index] !== "riding" ||
      !(Number.isFinite(speed) && speed >= SPEED_FLOOR) ||
      ahead < floor
    ) {
      return null;
    }
    min = Math.min(min, ahead);
    max = Math.max(max, ahead);
    total += ahead;
    minSpeed = Math.min(minSpeed, speed);
  }
  const from = rows.ticks[start] ?? -1;
  return { from, max, min, minSpeed, to: from + WINDOW_TICKS - 1, total };
};

export const candidatesOf = (
  rows: WorkloadRows,
  floor: number
): Candidate[] => {
  const found: Candidate[] = [];
  for (
    let start = rows.ticks.indexOf(WARMUP_TICKS);
    start >= 0 && start + WINDOW_TICKS <= rows.ticks.length;
    start += 1
  ) {
    const candidate = candidateAt(rows, start, floor);
    if (candidate) {
      found.push(candidate);
    }
  }
  return found.toSorted(
    (left, right) =>
      right.min - left.min || right.total - left.total || left.from - right.from
  );
};
