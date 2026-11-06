import { policeChoices, trafficChoices } from "@racer/career/room-race";
import { bikeIds } from "@racer/sim/bikes";
import { tiers } from "@racer/sim/difficulty";
import { roadIds } from "@racer/track/road";
import * as Schema from "effect/Schema";

export const BikeSchema = Schema.Literals(bikeIds);
export const PoliceSchema = Schema.Literals(policeChoices);
export const RoadSchema = Schema.Literals(roadIds);
export const TierSchema = Schema.Literals(tiers);
export const TrafficSchema = Schema.Literals(trafficChoices);

export const RoomChoiceChangeSchema = Schema.Struct({
  police: Schema.optionalKey(PoliceSchema),
  roadId: Schema.optionalKey(RoadSchema),
  tier: Schema.optionalKey(TierSchema),
  traffic: Schema.optionalKey(TrafficSchema),
});

export const RoomRuleSchema = Schema.Struct({
  bikeId: BikeSchema,
  police: PoliceSchema,
  roadId: RoadSchema,
  tier: TierSchema,
  traffic: TrafficSchema,
});
