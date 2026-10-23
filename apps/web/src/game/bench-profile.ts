import { benchRaces } from "@racer/career/bench";
import type { Bench } from "@racer/career/bench";
import {
  observeWorkload,
  workloadColumns,
  workloadModes,
} from "@racer/sim/bench-workload";
import type { RaceView } from "@racer/sim/race-view";

const CAPACITY = 8192;

interface BenchInfo {
  readonly bench: Bench;
  readonly roadId: string;
  readonly level: number;
  readonly seed: number;
  readonly bikeId: string;
  readonly race: number;
  readonly riders: number;
  readonly police: number;
  readonly firstTick: number;
  readonly lastTick: number;
  readonly samples: number;
  readonly capacity: number;
  readonly overflowed: boolean;
}

interface BenchRows {
  readonly ticks: number[];
  readonly modes: string[];
  readonly speeds: number[];
  readonly ahead: number[];
  readonly times: number[];
}

export interface BenchProfile {
  readonly record: (race: RaceView) => void;
  readonly dispose: () => void;
}

const policeIn = (race: RaceView): number => {
  let count = 0;
  for (const rider of race.riders) {
    if (rider.profile.role === "police") {
      count += 1;
    }
  }
  return count;
};

export const createBenchProfile = (
  bench: Bench | null,
  raceId: () => number
): BenchProfile | null => {
  if (bench === null) {
    return null;
  }
  const columns = workloadColumns(CAPACITY);
  const times = new Float64Array(CAPACITY);
  let current: RaceView | null = null;
  let race = 0;
  let samples = 0;
  let riders = 0;
  let police = 0;

  const record = (view: RaceView) => {
    if (view !== current) {
      current = view;
      race = raceId();
      samples = 0;
      riders = view.riders.length;
      police = policeIn(view);
    }
    const at = samples % CAPACITY;
    observeWorkload(view, columns, at);
    times[at] = performance.now();
    samples += 1;
  };

  const oldest = (): number => Math.max(0, samples - CAPACITY);

  const tickAt = (index: number): number =>
    columns.ticks[index % CAPACITY] ?? -1;

  const info = (): BenchInfo => ({
    ...benchRaces[bench],
    bench,
    capacity: CAPACITY,
    firstTick: samples > 0 ? tickAt(oldest()) : -1,
    lastTick: samples > 0 ? tickAt(samples - 1) : -1,
    overflowed: samples > CAPACITY,
    police,
    race,
    riders,
    samples,
  });

  const rowsOf = (fromTick: number, toTick: number): BenchRows => {
    const rows: BenchRows = {
      ahead: [],
      modes: [],
      speeds: [],
      ticks: [],
      times: [],
    };
    for (let index = oldest(); index < samples; index += 1) {
      const at = index % CAPACITY;
      const tick = columns.ticks[at] ?? -1;
      if (tick >= fromTick && tick <= toTick) {
        rows.ticks.push(tick);
        rows.modes.push(workloadModes[columns.modes[at] ?? -1] ?? "unknown");
        rows.speeds.push(columns.speeds[at] ?? Number.NaN);
        rows.ahead.push(columns.ahead[at] ?? 0);
        rows.times.push(times[at] ?? Number.NaN);
      }
    }
    return rows;
  };

  Reflect.set(globalThis, "__rushlineBench", { info, window: rowsOf });
  return {
    dispose() {
      Reflect.deleteProperty(globalThis, "__rushlineBench");
    },
    record,
  };
};
