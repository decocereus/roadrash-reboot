import type { RaceView, RiderView } from "./race-view.ts";
import { PLAYER_RIDER } from "./state.ts";

export const RIVALS_AHEAD_METRES = 150;

export const workloadModes = [
  "riding",
  "thrown",
  "lying",
  "running",
  "mounting",
  "busted",
  "wrecked",
] as const satisfies readonly RiderView["mode"][];

const NO_PLAYER_MODE = 255;

export interface WorkloadColumns {
  readonly ticks: Int32Array;
  readonly modes: Uint8Array;
  readonly speeds: Float64Array;
  readonly ahead: Uint8Array;
}

export const workloadColumns = (capacity: number): WorkloadColumns => ({
  ahead: new Uint8Array(capacity),
  modes: new Uint8Array(capacity),
  speeds: new Float64Array(capacity),
  ticks: new Int32Array(capacity),
});

const racersAhead = (race: RaceView, rider: RiderView): number => {
  let count = 0;
  for (const other of race.riders) {
    const gap = other.s - rider.s;
    if (
      other !== rider &&
      other.profile.role === "racer" &&
      gap > 0 &&
      gap <= RIVALS_AHEAD_METRES
    ) {
      count += 1;
    }
  }
  return count;
};

export const observeWorkload = (
  race: RaceView,
  into: WorkloadColumns,
  at: number
): void => {
  const player = race.riders[PLAYER_RIDER];
  into.ticks[at] = race.tick;
  if (!player) {
    into.modes[at] = NO_PLAYER_MODE;
    into.speeds[at] = Number.NaN;
    into.ahead[at] = 0;
    return;
  }
  into.modes[at] = workloadModes.indexOf(player.mode);
  into.speeds[at] = player.speed;
  into.ahead[at] = racersAhead(race, player);
};
