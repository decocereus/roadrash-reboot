import type { RoomRule } from "@racer/career/room-race";
import { STARTING_BIKE } from "@racer/career/tables";
import { TICK_RATE } from "@racer/sim/state";
import * as Schema from "effect/Schema";

import {
  BikeSchema,
  PoliceSchema,
  RoadSchema,
  TierSchema,
  TrafficSchema,
} from "./room-rule.ts";

const MS_PER_SECOND = 1000;

const secondsBetween = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ maximum, minimum }));

const PublicRaceSchema = Schema.Struct({
  bikeId: BikeSchema,
  police: PoliceSchema,
  roads: Schema.NonEmptyArray(RoadSchema),
  tier: TierSchema,
  traffic: TrafficSchema,
});

export const RoomConfigSchema = Schema.Struct({
  awaySeconds: secondsBetween(10, 600),
  customStartSeconds: secondsBetween(10, 300),
  loadDeadlineSeconds: secondsBetween(5, 60),
  publicGatherSeconds: secondsBetween(3, 60),
  publicRace: PublicRaceSchema,
  publicStartSeconds: secondsBetween(10, 300),
  queueWaitSeconds: secondsBetween(5, 300),
  raceLimitSeconds: secondsBetween(120, 1200),
  seatHoldSeconds: secondsBetween(5, 120),
}).check(
  Schema.makeFilter(
    ({ awaySeconds, seatHoldSeconds }) =>
      awaySeconds >= seatHoldSeconds ||
      "awaySeconds is shorter than seatHoldSeconds",
    { title: "a lobby AWAY no shorter than the race hold" }
  ),
  Schema.makeFilter(
    ({ publicGatherSeconds, publicStartSeconds }) =>
      publicGatherSeconds <= publicStartSeconds ||
      "publicGatherSeconds is longer than publicStartSeconds",
    { title: "a public lobby's earliest start no later than its latest" }
  )
);

export type RoomConfig = typeof RoomConfigSchema.Type;
export type PublicRace = typeof PublicRaceSchema.Type;

export const launchRoomConfig: RoomConfig = {
  awaySeconds: 120,
  customStartSeconds: 60,
  loadDeadlineSeconds: 20,
  publicGatherSeconds: 10,
  publicRace: {
    bikeId: STARTING_BIKE,
    police: "normal",
    roads: ["slag-row", "breakwater-run", "ridge-road"],
    tier: 2,
    traffic: "normal",
  },
  publicStartSeconds: 45,
  queueWaitSeconds: 30,
  raceLimitSeconds: 360,
  seatHoldSeconds: 30,
};

export const msOf = (seconds: number): number => seconds * MS_PER_SECOND;

export const ticksOf = (seconds: number): number => seconds * TICK_RATE;

export const publicRuleFor = (
  { bikeId, police, roads, tier, traffic }: PublicRace,
  seed: number
): RoomRule => ({
  bikeId,
  police,
  roadId: roads[seed % roads.length] ?? roads[0],
  tier,
  traffic,
});
