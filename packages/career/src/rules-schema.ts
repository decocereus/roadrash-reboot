import { MOST_RACERS } from "@racer/sim/race";
import { roadLevels } from "@racer/track/road";
import * as Schema from "effect/Schema";

import { fewestRacers } from "./field.ts";
import type { RaceRules } from "./rules.ts";
import { byLevel } from "./tables.ts";

const PoliceCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const RaceRulesSchema = Schema.Struct({
  fieldSize: Schema.Int.check(
    Schema.isBetween({ maximum: MOST_RACERS, minimum: fewestRacers })
  ),
  levelCount: Schema.Literals(roadLevels),
  police: Schema.Struct(byLevel(() => PoliceCount)),
}) satisfies Schema.Codec<RaceRules>;
