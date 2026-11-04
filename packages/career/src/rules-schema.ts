import { MOST_RACERS } from "@racer/sim/race";
import * as Schema from "effect/Schema";

import { fewestLevels, fewestRacers } from "./field.ts";
import type { RaceRules } from "./rules.ts";
import { byLevel, levels } from "./tables.ts";

const PoliceCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const RaceRulesSchema = Schema.Struct({
  celebrities: Schema.Boolean,
  fieldSize: Schema.Int.check(
    Schema.isBetween({ maximum: MOST_RACERS, minimum: fewestRacers })
  ),
  levelCount: Schema.Literals(levels).check(
    Schema.isGreaterThanOrEqualTo(fewestLevels)
  ),
  police: Schema.Struct(byLevel(() => PoliceCount)),
}) satisfies Schema.Codec<RaceRules>;
