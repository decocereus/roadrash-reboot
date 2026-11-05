import type { BikeId } from "@racer/sim/bikes";
import { firstRacers, roomSetup } from "@racer/sim/room";
import type { RiderId } from "@racer/sim/state";
import { roadIds } from "@racer/track/road";
import { trackFor } from "@racer/track/roads";

import { practiceSetup } from "./field.ts";
import type { CareerRaceSetup, PracticeRace } from "./field.ts";
import { createRaceLog } from "./outcome.ts";
import { launchRules } from "./rules.ts";
import type { RaceRules } from "./rules.ts";
import type { RacerId } from "./state.ts";
import { STARTING_BIKE } from "./tables.ts";
import type { RoadId, Tier } from "./tables.ts";

const roomRules: RaceRules = { ...launchRules, celebrities: false };

export const trafficChoices = ["light", "normal", "heavy"] as const;
export const policeChoices = ["none", "normal", "many"] as const;

export type TrafficChoice = (typeof trafficChoices)[number];
export type PoliceChoice = (typeof policeChoices)[number];

export interface RoomChoice {
  readonly police: PoliceChoice;
  readonly roadId: RoadId;
  readonly tier: Tier;
  readonly traffic: TrafficChoice;
}

export interface RoomRule extends RoomChoice {
  readonly bikeId: BikeId;
}

export const publicRoomRule: RoomRule = {
  bikeId: STARTING_BIKE,
  police: "normal",
  roadId: "slag-row",
  tier: 2,
  traffic: "normal",
};

export const publicRuleFor = (seed: number): RoomRule => ({
  ...publicRoomRule,
  roadId: roadIds[seed % roadIds.length] ?? publicRoomRule.roadId,
});

const trafficScale = {
  heavy: 1.5,
  light: 0.5,
  normal: 1,
} as const satisfies Record<TrafficChoice, number>;

const policeScale = {
  many: 1.5,
  none: 0,
  normal: 1,
} as const satisfies Record<PoliceChoice, number>;

export const ROOM_FIELD_SIZE = roomRules.fieldSize;

export interface SeatedRace {
  readonly setup: CareerRaceSetup;
  readonly humans: readonly RiderId[];
  readonly road: RoadId;
}

const fairStartFor = (
  setup: CareerRaceSetup,
  humans: number
): CareerRaceSetup => {
  const { aggression, bike, skill, weapon } = setup.player;
  return {
    ...setup,
    gridOrder: "playerFirst",
    rivals: setup.rivals.map((rival, at) =>
      at < humans - 1
        ? { ...rival, aggression, bike, skill, weapon }
        : { ...rival, bike }
    ),
  };
};

export const seatedRace = (
  seed: number,
  seats: number,
  rule: RoomRule = publicRoomRule
): SeatedRace => {
  const race: PracticeRace = { ...rule, seed };
  const practice = practiceSetup(roomRules, race, trackFor(race.roadId));
  const field: CareerRaceSetup = {
    ...practice,
    conditions: {
      ...practice.conditions,
      trafficDensity:
        practice.conditions.trafficDensity * trafficScale[rule.traffic],
    },
    police: {
      ...practice.police,
      count: Math.ceil(practice.police.count * policeScale[rule.police]),
    },
  };
  const humans = firstRacers(field, seats);
  return {
    humans,
    road: race.roadId,
    setup: roomSetup(fairStartFor(field, humans.length), humans),
  };
};

export type GuestNames = ReadonlyMap<RacerId, string>;
export type GuestColours = ReadonlyMap<RacerId, number>;

export const byGuest = <Value>(
  setup: CareerRaceSetup,
  me: RiderId,
  values: readonly Value[]
): ReadonlyMap<RacerId, Value> => {
  const humans = firstRacers(setup, values.length);
  return new Map(
    createRaceLog(setup, me).entrants.flatMap((entrant) => {
      const value = values[humans.indexOf(entrant.rider)];
      return value === undefined ? [] : [[entrant.rival, value] as const];
    })
  );
};
