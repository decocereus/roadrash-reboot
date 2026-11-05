import { practiceSetup } from "@racer/career/field";
import { launchRules } from "@racer/career/rules";
import { difficulties } from "@racer/sim/difficulty";
import type { Tier } from "@racer/sim/difficulty";
import {
  createRace,
  defaultSetup,
  emptyFrame,
  stepRace,
} from "@racer/sim/race";
import type { RaceSetup } from "@racer/sim/state";
import type { RoadId } from "@racer/track/road";
import type { Track } from "@racer/track/track";

import type { Field, Pacing } from "./options.ts";
import { createTally, tallyTick } from "./tally.ts";
import type { RaceCounts, RoadWindow } from "./tally.ts";

const TICKS_PER_SECOND = 60;
const TICK_LIMIT = TICKS_PER_SECOND * 420;
const NO_PACING = { catchUp: 0, leadEase: 0 };

export interface RaceRequest {
  readonly field: Field;
  readonly pacing: Pacing;
  readonly road: RoadId;
  readonly seed: number;
  readonly tier: Tier;
  readonly track: Track;
  readonly windows: readonly RoadWindow[];
}

export interface RaceResult {
  readonly counts: RaceCounts;
  readonly crashes: number;
  readonly finishes: readonly number[];
  readonly riders: number;
  readonly seed: number;
}

const setups = {
  career: ({ road, seed, tier, track }: RaceRequest): RaceSetup =>
    practiceSetup(
      launchRules,
      { bikeId: "ostra-sesta-600", roadId: road, seed, tier },
      track
    ),
  default: ({ seed, track }: RaceRequest): RaceSetup =>
    defaultSetup(track, seed),
} satisfies Record<Field, (request: RaceRequest) => RaceSetup>;

const pacings = {
  off: () => NO_PACING,
  on: (tier: Tier) => difficulties[tier].pacing,
} satisfies Record<Pacing, (tier: Tier) => RaceSetup["pacing"]>;

export const runRace = (request: RaceRequest): RaceResult => {
  const setup = setups[request.field](request);
  const race = createRace({
    ...setup,
    conditions: difficulties[request.tier].conditions,
    pacing: pacings[request.pacing](request.tier),
    player: { ...setup.player, controller: "pilot" },
    police: { ...setup.police, count: 0 },
  });
  const tally = createTally(race, request.windows);
  for (
    let tick = 0;
    tick < TICK_LIMIT && race.riders.some((rider) => rider.finishTick < 0);
    tick += 1
  ) {
    stepRace(race, request.track, emptyFrame);
    tallyTick(tally, race, request.track);
  }
  return {
    counts: tally.counts,
    crashes: race.riders.reduce((sum, rider) => sum + rider.crashes, 0),
    finishes: race.riders
      .filter((rider) => rider.finishTick >= 0)
      .map((rider) => rider.finishTick / TICKS_PER_SECOND)
      .toSorted((one, other) => one - other),
    riders: race.riders.length,
    seed: request.seed,
  };
};
