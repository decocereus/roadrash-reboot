import { bikes } from "@racer/sim/bikes";
import { topSpeedOf } from "@racer/sim/engine";
import { MOST_RACERS } from "@racer/sim/race";
import * as Schema from "effect/Schema";

import { fewestRacers } from "./field.ts";
import type { RaceRules } from "./rules.ts";
import { Bike, Tier } from "./save-values.ts";

const BikeMatch = Schema.Struct({ from: Bike, tier: Tier, to: Bike }).check(
  Schema.makeFilter(
    ({ from, to }) =>
      topSpeedOf(bikes[to]) > topSpeedOf(bikes[from]) ||
      `${to} is no faster than ${from}`,
    { title: "a bike match onto a faster bike" }
  )
);

export const RaceRulesSchema = Schema.Struct({
  bikeMatches: Schema.Array(BikeMatch),
  celebrities: Schema.Boolean,
  fieldSize: Schema.Int.check(
    Schema.isBetween({ maximum: MOST_RACERS, minimum: fewestRacers })
  ),
}) satisfies Schema.Codec<RaceRules>;
