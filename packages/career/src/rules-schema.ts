import { MOST_RACERS } from "@racer/sim/race";
import * as Schema from "effect/Schema";

import { fewestRacers } from "./field.ts";
import type { RaceRules } from "./rules.ts";

export const RaceRulesSchema = Schema.Struct({
  celebrities: Schema.Boolean,
  fieldSize: Schema.Int.check(
    Schema.isBetween({ maximum: MOST_RACERS, minimum: fewestRacers })
  ),
}) satisfies Schema.Codec<RaceRules>;
